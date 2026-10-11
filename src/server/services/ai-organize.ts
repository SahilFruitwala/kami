import "@tanstack/react-start/server-only";
import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { OrganizeProgress } from "@/lib/api/ai";
import { getDb } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit.server.ts";
import { articles, folders } from "@/lib/schema";
import { normalizeTag } from "@/lib/store";
import { aiConfigured } from "@/lib/llm.server.ts";
import { generateJson } from "@/server/ai";
import {
  articleDocument,
  loadArticleForAi,
  userTagVocabulary,
} from "@/server/services/ai-articles";
import { patchLibraryItem } from "@/server/services/library";

/**
 * Auto-organise: give articles that have neither tags nor a folder a few tags
 * and one of the user's existing folders. The browser pulls this in small
 * batches (same pattern as the semantic indexer), both from the Settings
 * button (the whole library) and quietly after new saves.
 *
 * Only untouched articles are candidates and only additions are made, so a
 * user's own tags and folders are never replaced.
 */

const BATCH = 4;
/** Enough of the piece to place it, far cheaper than a full summary. */
const ORGANIZE_CHARS = 6_000;
const MAX_TAGS = 4;

export const organizeBody = z.object({
  /** Ids already tried this session (failed or skipped) so they aren't retried. */
  exclude: z.array(z.string().min(1).max(2000)).max(1000).default([]),
});

const organizeSchema = z.object({
  tags: z
    .array(z.string())
    .describe(
      "Two to four short topic tags. Prefer tags from the existing list; only invent one when none fits.",
    ),
  folder: z
    .string()
    .nullable()
    .describe("The best matching folder name from the existing list, or null when none fits."),
});

/** Untouched articles with a real body (link stubs have nothing to read). */
function candidateWhere(userId: string, exclude: string[]) {
  return and(
    eq(articles.userId, userId),
    sql`jsonb_array_length(${articles.tags}) = 0`,
    sql`${articles.folderId} is null`,
    sql`length(${articles.contentHtml}) > 600`,
    sql`${articles.contentHtml} not like '%Saved as a link.%'`,
    exclude.length ? notInArray(articles.id, exclude) : undefined,
  );
}

export async function organizeBatch(
  userId: string,
  body: z.output<typeof organizeBody>,
): Promise<OrganizeProgress> {
  if (!aiConfigured()) return { enabled: false, done: [], attempted: [], remaining: 0 };
  const db = await getDb();

  const rows = await db
    .select({ id: articles.id })
    .from(articles)
    .where(candidateWhere(userId, body.exclude))
    .orderBy(asc(articles.savedAt))
    .limit(BATCH);
  if (rows.length === 0) return { enabled: true, done: [], attempted: [], remaining: 0 };

  await enforceRateLimit(userId, "ai", rows.length);

  const [vocabulary, folderRows] = await Promise.all([
    userTagVocabulary(userId),
    db.select({ id: folders.id, name: folders.name }).from(folders).where(eq(folders.userId, userId)),
  ]);
  const existing = new Map(vocabulary.map((t) => [t.toLowerCase(), t]));
  const folderByName = new Map(folderRows.map((f) => [f.name.toLowerCase(), f.id]));

  const settled = await Promise.allSettled(
    rows.map(async ({ id }) => {
      const article = await loadArticleForAi(userId, id);
      const { output } = await generateJson(organizeSchema, {
        instructions: [
          "You file articles in a calm personal reading library.",
          "Choose a few short topic tags and, if one clearly fits, one existing folder.",
          "Write tags in the article's language, lowercase, one or two words.",
        ].join("\n"),
        prompt: [
          `Existing tags: ${vocabulary.length ? vocabulary.join(", ") : "(none yet)"}`,
          `Existing folders: ${folderRows.length ? folderRows.map((f) => f.name).join(", ") : "(none)"}`,
          "",
          articleDocument(article, ORGANIZE_CHARS),
        ].join("\n"),
        maxOutputTokens: 200,
      });

      const seen = new Set<string>();
      const tags: string[] = [];
      for (const raw of output.tags) {
        const clean = normalizeTag(raw.replace(/^#/, ""));
        const key = clean.toLowerCase();
        if (!clean || seen.has(key)) continue;
        seen.add(key);
        tags.push(existing.get(key) ?? clean);
        if (tags.length === MAX_TAGS) break;
      }
      const folderId = output.folder ? (folderByName.get(output.folder.trim().toLowerCase()) ?? null) : null;
      if (tags.length === 0 && !folderId) return null;

      const item = await patchLibraryItem(userId, id, {
        tagOps: tags.map((tag) => ({ op: "add" as const, tag })),
        ...(folderId ? { folderId } : {}),
      });
      return { id, tags: item.tags, folderId: item.folderId };
    }),
  );

  const done: OrganizeProgress["done"] = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value) done.push(result.value);
    else if (result.status === "rejected") console.error("[organize] article failed:", result.reason);
  }

  // Everything in this batch is "tried" now, whether or not it worked.
  const tried = [...body.exclude, ...rows.map((r) => r.id)];
  const [{ value }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(articles)
    .where(candidateWhere(userId, tried));
  return { enabled: true, done, attempted: rows.map((r) => r.id), remaining: Number(value ?? 0) };
}
