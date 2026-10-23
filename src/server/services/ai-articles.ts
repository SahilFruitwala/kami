import "@tanstack/react-start/server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { ArticleSummary, TidyResult } from "@/lib/api/ai";
import { invalidateUserCache } from "@/lib/cache.server.ts";
import { textFromHtml } from "@/lib/article-build.server.ts";
import { getDb } from "@/lib/db";
import type { LibraryItem } from "@/lib/store";
import { readStoredGist, shapeGist, type StoredGist } from "@/lib/gist.ts";
import { aiConfigured } from "@/lib/llm.server";
import { clipText } from "@/lib/model-fallback.ts";
import { articleAi, articles, folders } from "@/lib/schema";
import { TAG_CATEGORIES } from "@/lib/tag-categories.ts";
import {
  asTidyState,
  onRestore,
  onTidy,
  type TidyOutcome,
  type TidyRecord,
} from "@/lib/tidy-state";
import {
  asDocument,
  chatHistory,
  generateJson,
  streamChat,
  type chatTurnInput,
} from "@/server/ai";
import { runInBackground } from "@/server/background";
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
  folder: z
    .string()
    .nullable()
    .describe("The best matching folder name from the existing list, or null when none fits."),
});

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
  return {
    ...readStoredGist(row.summary),
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
  const folderRows = await db
    .select({ id: folders.id, name: folders.name })
    .from(folders)
    .where(eq(folders.userId, userId));

  const { output, model } = await generateJson(summarySchema, {
    instructions: [
      "You summarise articles for a calm personal reading library.",
      "Write plainly and neutrally in the article's language. No hype, no emojis, no 'This article…' openers.",
      "Suggest a folder that would help the reader find this piece again.",
    ].join("\n"),
    prompt: [
      `Existing folders: ${folderRows.length ? folderRows.map((f) => f.name).join(", ") : "(none)"}`,
      "",
      articleDocument(article),
    ].join("\n"),
    maxOutputTokens: 900,
  });

  const summary: StoredGist = shapeGist(
    output,
    folderRows,
    article.text.length > MAX_ARTICLE_CHARS,
  );
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
 * subscribe/share/referral prompts, footers — and store the copy without it.
 * The model only picks block numbers; the text itself is never rewritten.
 * The body before the change is kept as the Original copy so the reader can
 * restore it. A model failure is recorded as `failed` (the reader then offers
 * "Retry clean-up") and rethrown.
 */
export async function tidyArticle(userId: string, articleId: string): Promise<TidyResult> {
  const { splitBlocks, joinBlocks } = await import("@/lib/tidy-html.server.ts");
  const db = await getDb();
  const [row] = await db
    .select({
      html: articles.contentHtml,
      originalHtml: articles.originalHtml,
      tidyState: articles.tidyState,
      title: articles.title,
    })
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)))
    .limit(1);
  if (!row) throw notFound("That article is no longer in your library.");
  const record: TidyRecord = {
    contentHtml: row.html,
    originalHtml: row.originalHtml,
    tidyState: asTidyState(row.tidyState),
  };

  const { blocks, previews } = splitBlocks(row.html);
  if (blocks.length < 3 || row.html.includes("Saved as a link.")) {
    return { item: await storeTidy(userId, articleId, record, { kind: "refused" }), removed: [] };
  }

  let remove: number[];
  try {
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
    remove = output.remove;
  } catch (err) {
    await storeTidy(userId, articleId, record, { kind: "failed" });
    throw err;
  }

  const drop = new Set(remove.filter((n) => Number.isInteger(n) && n >= 0 && n < previews.length));
  // Refuse a "cleanup" that would gut the piece.
  const outcome: TidyOutcome =
    drop.size >= blocks.length * 0.6
      ? { kind: "refused" }
      : drop.size
        ? { kind: "removed", contentHtml: joinBlocks(blocks, drop) }
        : { kind: "nothing" };
  return {
    item: await storeTidy(userId, articleId, record, outcome),
    removed:
      outcome.kind === "removed" ? [...drop].sort((a, b) => a - b).map((i) => previews[i]) : [],
  };
}

/**
 * Tidy a freshly saved article after the response is sent, so saving stays
 * instant. Does nothing without a usable model; failures are recorded on the
 * article (`failed`) and logged.
 */
export function tidyInBackground(userId: string, articleId: string): void {
  if (!aiConfigured()) return;
  runInBackground("tidy", () => tidyArticle(userId, articleId));
}

/**
 * Write a Tidy outcome, but only onto the body it was computed from: if a
 * save replaced the body meanwhile, leave that newer copy alone.
 */
async function storeTidy(
  userId: string,
  articleId: string,
  record: TidyRecord,
  outcome: TidyOutcome,
): Promise<LibraryItem> {
  return writeTidyRecord(userId, articleId, record, onTidy(record, outcome));
}

/** Put an article's Original copy back (undoing Tidy). */
export async function restoreOriginal(userId: string, articleId: string): Promise<LibraryItem> {
  const db = await getDb();
  const [row] = await db
    .select({
      html: articles.contentHtml,
      originalHtml: articles.originalHtml,
      tidyState: articles.tidyState,
    })
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)))
    .limit(1);
  if (!row) throw notFound("That article is no longer in your library.");
  if (row.originalHtml === null) throw badRequest("There is no original copy to restore.");
  const record: TidyRecord = {
    contentHtml: row.html,
    originalHtml: row.originalHtml,
    tidyState: asTidyState(row.tidyState),
  };
  return writeTidyRecord(userId, articleId, record, onRestore(record));
}

async function writeTidyRecord(
  userId: string,
  articleId: string,
  from: TidyRecord,
  next: TidyRecord,
): Promise<LibraryItem> {
  const { getArticle } = await import("@/server/services/library");
  const db = await getDb();
  await db
    .update(articles)
    .set({
      contentHtml: next.contentHtml,
      originalHtml: next.originalHtml,
      tidyState: next.tidyState,
    })
    .where(
      and(
        eq(articles.id, articleId),
        eq(articles.userId, userId),
        eq(articles.contentHtml, from.contentHtml),
      ),
    );
  await invalidateUserCache(userId);
  return getArticle(userId, articleId);
}

// ---------- Auto-tag ----------

const autoTagSchema = z.object({
  categories: z
    .array(z.enum(TAG_CATEGORIES))
    .min(1)
    .max(3)
    .describe("One to three categories that best describe the piece, most fitting first."),
});

/** Tag an article with one to three categories from the fixed list. */
export async function autoTagArticle(userId: string, articleId: string): Promise<{ tags: string[] }> {
  const { patchLibraryItem } = await import("@/server/services/library");
  const article = await loadArticleForAi(userId, articleId);
  const { output } = await generateJson(autoTagSchema, {
    instructions: [
      "You file articles in a personal reading library using a fixed set of categories.",
      `Categories: ${TAG_CATEGORIES.join(", ")}.`,
      "Pick the one to three that fit best. Use 'other' only when nothing else fits.",
    ].join("\n"),
    prompt: articleDocument(article, 6_000),
    maxOutputTokens: 100,
  });
  const have = new Set(article.tags.map((t) => t.toLowerCase()));
  const add = [...new Set(output.categories)].filter((c) => !have.has(c));
  if (!add.length) return { tags: article.tags };
  const item = await patchLibraryItem(userId, articleId, {
    tagOps: add.map((tag) => ({ op: "add" as const, tag })),
  });
  return { tags: item.tags };
}
