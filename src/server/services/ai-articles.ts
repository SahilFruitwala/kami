import "@tanstack/react-start/server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { ArticleSummary, TidyResult } from "@/lib/api/ai";
import { textFromHtml } from "@/lib/article-build.server.ts";
import { getDb } from "@/lib/db";
import { clipText } from "@/lib/model-fallback.ts";
import { articleAi, articles, folders } from "@/lib/schema";
import { normalizeTag } from "@/lib/store";
import {
  asDocument,
  chatHistory,
  generateJson,
  streamChat,
  type chatTurnInput,
} from "@/server/ai";
import { badRequest, notFound } from "@/server/http";

/**
 * Article summaries: a TL;DR, key points and organisation suggestions (tags
 * from the user's own vocabulary, an existing folder), made on demand from
 * the reader and cached per article until its text changes.
 */

/** Article text sent to the model: enough for a long essay, bounded for cost. */
const MAX_ARTICLE_CHARS = 24_000;
const MIN_ARTICLE_CHARS = 200;

const summarySchema = z.object({
  tldr: z
    .string()
    .describe("Two or three plain sentences: what the piece says and why it matters."),
  keyPoints: z
    .array(z.string())
    .describe(
      "Three to six short key points, each one sentence, in the order the piece makes them.",
    ),
  tags: z
    .array(z.string())
    .describe(
      "Up to five short topic tags. Prefer tags from the existing list; only invent one when none fits.",
    ),
  folder: z
    .string()
    .nullable()
    .describe("The best matching folder name from the existing list, or null when none fits."),
});

type StoredSummary = Omit<ArticleSummary, "stale" | "createdAt" | "model">;

const hashContent = (html: string) => createHash("sha256").update(html).digest("hex");

export type ArticleForAi = {
  id: string;
  title: string;
  author: string;
  siteName: string;
  url: string;
  text: string;
  contentHash: string;
  tags: string[];
};

/** Load one of the user's articles as plain text for a prompt. */
export async function loadArticleForAi(userId: string, articleId: string): Promise<ArticleForAi> {
  const db = await getDb();
  const [row] = await db
    .select({
      id: articles.id,
      title: articles.title,
      author: articles.author,
      siteName: articles.siteName,
      url: articles.canonicalUrl,
      html: articles.contentHtml,
      tags: articles.tags,
    })
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)))
    .limit(1);
  if (!row) throw notFound("That article is no longer in your library.");
  const text = textFromHtml(row.html);
  if (text.length < MIN_ARTICLE_CHARS || row.html.includes("Saved as a link.")) {
    throw badRequest("There isn't enough text here yet. Open the article to fetch a clean copy.");
  }
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    siteName: row.siteName,
    url: row.url,
    text,
    contentHash: hashContent(row.html),
    tags: row.tags ?? [],
  };
}

/** The article as a <document> block for a prompt. */
export function articleDocument(article: ArticleForAi, maxChars = MAX_ARTICLE_CHARS): string {
  return asDocument(clipText(article.text, maxChars), {
    title: article.title,
    author: article.author || undefined,
    site: article.siteName || undefined,
  });
}

/** Tags the user already uses, most used first. */
export async function userTagVocabulary(userId: string, limit = 120): Promise<string[]> {
  const db = await getDb();
  const result = await db.execute<{ tag: string }>(sql`
    select tag from (
      select jsonb_array_elements_text(${articles.tags}) as tag
      from ${articles} where ${articles.userId} = ${userId}
    ) t
    group by tag order by count(*) desc, tag limit ${limit}
  `);
  return result.rows.map((r) => r.tag);
}

function toSummary(
  row: { summary: unknown; contentHash: string; model: string | null; createdAt: Date },
  currentHash: string | null,
): ArticleSummary {
  const stored = row.summary as StoredSummary;
  return {
    ...stored,
    model: row.model,
    createdAt: row.createdAt.getTime(),
    stale: currentHash !== null && currentHash !== row.contentHash,
  };
}

/** The cached summary, or null when the article has none yet. */
export async function getArticleSummary(
  userId: string,
  articleId: string,
): Promise<ArticleSummary | null> {
  const db = await getDb();
  const [row] = await db
    .select({
      summary: articleAi.summary,
      contentHash: articleAi.contentHash,
      model: articleAi.model,
      createdAt: articleAi.createdAt,
      html: articles.contentHtml,
    })
    .from(articleAi)
    .innerJoin(articles, eq(articles.id, articleAi.articleId))
    .where(and(eq(articleAi.articleId, articleId), eq(articleAi.userId, userId)))
    .limit(1);
  return row ? toSummary(row, hashContent(row.html)) : null;
}

/** Generate (or regenerate) the summary and store it. */
export async function summarizeArticle(userId: string, articleId: string): Promise<ArticleSummary> {
  const article = await loadArticleForAi(userId, articleId);
  const db = await getDb();
  const [vocabulary, folderRows] = await Promise.all([
    userTagVocabulary(userId),
    db
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(eq(folders.userId, userId)),
  ]);

  const { output, model } = await generateJson(summarySchema, {
    instructions: [
      "You summarise articles for a calm personal reading library.",
      "Write plainly and neutrally in the article's language. No hype, no emojis, no 'This article…' openers.",
      "Suggest tags and a folder that would help the reader find this piece again.",
    ].join("\n"),
    prompt: [
      `Existing tags: ${vocabulary.length ? vocabulary.join(", ") : "(none yet)"}`,
      `Existing folders: ${folderRows.length ? folderRows.map((f) => f.name).join(", ") : "(none)"}`,
      "",
      articleDocument(article),
    ].join("\n"),
    maxOutputTokens: 900,
  });

  const existing = new Map(vocabulary.map((t) => [t.toLowerCase(), t]));
  const seen = new Set(article.tags.map((t) => t.toLowerCase()));
  const tags: string[] = [];
  for (const raw of output.tags) {
    const clean = normalizeTag(raw.replace(/^#/, ""));
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    tags.push(existing.get(key) ?? clean);
    if (tags.length === 5) break;
  }
  const folderName = output.folder?.trim().toLowerCase();
  const folder = folderName
    ? folderRows.find((f) => f.name.toLowerCase() === folderName)
    : undefined;

  const summary: StoredSummary = {
    tldr: output.tldr.trim(),
    keyPoints: output.keyPoints
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 6),
    tags,
    folderId: folder?.id ?? null,
  };
  const [row] = await db
    .insert(articleAi)
    .values({
      articleId,
      userId,
      summary,
      contentHash: article.contentHash,
      model,
    })
    .onConflictDoUpdate({
      target: articleAi.articleId,
      set: { summary, contentHash: article.contentHash, model, createdAt: new Date() },
    })
    .returning();
  return toSummary(row, article.contentHash);
}

/** One chat turn about an article; the article itself rides in the instructions. */
export async function chatAboutArticle(
  userId: string,
  articleId: string,
  body: z.output<typeof chatTurnInput>,
): Promise<Response> {
  const history = chatHistory(body);
  const article = await loadArticleForAi(userId, articleId);
  return streamChat({
    instructions: [
      "You help someone think about an article they are reading. The article is below.",
      "Answer from the article first and quote short phrases from it when useful.",
      "If the article doesn't cover something, say so plainly; you may then add general knowledge, clearly marked as not from the article.",
      "Be concise: a few short paragraphs or a short list. Use the reader's language.",
      "",
      articleDocument(article),
    ].join("\n"),
    history,
  });
}

// ---------- Tidy ----------

const tidySchema = z.object({
  remove: z
    .array(z.number().int())
    .describe("Numbers of the blocks to remove. Empty when everything is part of the piece."),
});

/**
 * Find the clutter in a saved copy — newsletter sponsor slots, ads,
 * subscribe/share/referral prompts, footers — and return the HTML without
 * it. The model only picks block numbers; the text itself is never
 * rewritten. Nothing is saved: the reader applies it (with undo).
 */
export async function tidyArticle(userId: string, articleId: string): Promise<TidyResult> {
  const { splitBlocks, joinBlocks } = await import("@/lib/tidy-html.server.ts");
  const db = await getDb();
  const [row] = await db
    .select({ html: articles.contentHtml, title: articles.title })
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)))
    .limit(1);
  if (!row) throw notFound("That article is no longer in your library.");
  const { blocks, previews } = splitBlocks(row.html);
  if (blocks.length < 3) throw badRequest("This copy is already as tidy as it gets.");

  const { output } = await generateJson(tidySchema, {
    instructions: [
      "You clean up a saved copy of an article or email newsletter for a reading app.",
      "Below are its top-level blocks, numbered, each shown as a short preview.",
      "List the blocks that are not part of the piece itself: ads, sponsor messages, 'subscribe', 'share', 'refer a friend' or 'view in browser' prompts, unsubscribe and legal footers, social links, and navigation.",
      "Keep anything that is the author's writing, including intros and sign-offs. When unsure, keep the block.",
    ].join("\n"),
    prompt: asDocument(previews.map((p, i) => `${i}. ${p}`).join("\n"), { title: row.title }),
    maxOutputTokens: 400,
    temperature: 0,
  });
  const drop = new Set(
    output.remove.filter((n) => Number.isInteger(n) && n >= 0 && n < previews.length),
  );
  // Refuse a "cleanup" that would gut the piece.
  if (drop.size >= blocks.length * 0.6) {
    throw badRequest("That would remove most of this piece, so nothing was changed.");
  }
  return {
    contentHtml: drop.size ? joinBlocks(blocks, drop) : row.html,
    removed: [...drop].sort((a, b) => a - b).map((i) => previews[i]),
  };
}
