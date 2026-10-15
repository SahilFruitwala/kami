import "@tanstack/react-start/server-only";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import type { BulkSaveLinksResult } from "@/lib/api/types";
import { invalidateUserCache } from "@/lib/cache.server.ts";
import { getDb } from "@/lib/db.server";
import { articles } from "@/lib/schema";
import type { Article } from "@/lib/article-types";
import { uid } from "@/lib/id";
import { articleToItem, clampLibraryItem, type LibraryItem } from "@/lib/library-item";

export const bulkSaveBody = z.object({
  urls: z.array(z.string().trim().min(4).max(2000)).min(1).max(50),
});

/** Bulk extraction budgets: per-URL soft timeout, worker concurrency, and an
 *  overall deadline after which remaining URLs fall back to empty stubs (the
 *  reader upgrades those on open). Keeps bulk responsive without risking the
 *  function timeout for large batches of slow pages. */
const BULK_EXTRACT_CONCURRENCY = 5;
const BULK_PER_URL_MS = 8000;
const BULK_DEADLINE_MS = 25000;

/** Race a promise against a timeout; resolves null on timeout or rejection. */
function bulkSettled<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/**
 * Bulk save links with titles fetched up front: each URL is extracted (bounded
 * concurrency + budgets) so library cards show the real title/excerpt/cover
 * immediately. URLs that fail, time out, or fall past the deadline are stored
 * as empty-body stubs — the reader lazy-extracts those on open. Dedupes
 * against the caller's existing library by URL.
 */
export async function bulkSaveLinks(
  userId: string,
  data: z.output<typeof bulkSaveBody>,
): Promise<BulkSaveLinksResult> {
  const { assertPublicHttpUrl } = await import("@/lib/safe-url.ts");
  const { extractArticleFromUrl } = await import("@/lib/extract.server.ts");
  const db = await getDb();
  const saved: LibraryItem[] = [];
  const skipped: string[] = [];
  const errors: { url: string; error: string }[] = [];

  // Phase 1 — validate + dedupe + skip already-saved (cheap sequential queries).
  type Pending = { raw: string; href: string; host: string; index: number };
  const seen = new Set<string>();
  const pending: Pending[] = [];
  const urls = data.urls.map((u) => u.trim()).filter(Boolean);
  const now = Date.now();
  for (let idx = 0; idx < urls.length; idx += 1) {
    const raw = urls[idx]!.slice(0, 2000);
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const pageUrl = assertPublicHttpUrl(raw);
      const href = pageUrl.href;
      const existing = await db
        .select({ id: articles.id })
        .from(articles)
        .where(
          and(
            eq(articles.userId, userId),
            or(eq(articles.url, href), eq(articles.canonicalUrl, href)),
          ),
        )
        .limit(1);
      if (existing[0]) {
        skipped.push(raw);
        continue;
      }
      pending.push({ raw, href, host: pageUrl.hostname.replace(/^www\./, ""), index: idx });
    } catch (err) {
      errors.push({ url: raw, error: err instanceof Error ? err.message : "Invalid URL." });
    }
  }

  // Each URL costs one extraction against the user's budget.
  if (pending.length > 0) {
    const { enforceRateLimit } = await import("@/lib/rate-limit.server.ts");
    await enforceRateLimit(userId, "extract", pending.length);
  }

  // Phase 2 — extract clean copies with bounded concurrency. Past the
  // overall deadline, remaining URLs keep null (stub fallback below).
  const found: Array<Article | null> = new Array(pending.length).fill(null);
  const deadline = Date.now() + BULK_DEADLINE_MS;
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < pending.length) {
      const slot = cursor;
      cursor += 1;
      const job = pending[slot]!;
      if (Date.now() > deadline) return;
      const result = await bulkSettled(extractArticleFromUrl(job.href), BULK_PER_URL_MS);
      if (result?.ok) found[slot] = result.article;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(BULK_EXTRACT_CONCURRENCY, pending.length) }, () => worker()),
  );

  // Phase 3 — insert rows sequentially. Invalidate in `finally` so rows
  // committed before an unexpected error still show up on next read.
  try {
    for (let slot = 0; slot < pending.length; slot += 1) {
      const job = pending[slot]!;
      const article: Article = found[slot] ?? {
        url: job.href,
        canonicalUrl: job.href,
        title: job.host,
        author: "",
        siteName: job.host,
        published: null,
        excerpt: "",
        contentHtml: "",
        wordCount: 0,
        readingMinutes: 1,
        source: "blog",
        heroImage: null,
      };
      // Same clamp as the single upsert, so extractor output always fits the row.
      const item = clampLibraryItem(
        articleToItem(
          { ...article, title: article.title.trim() || job.host },
          { savedAt: now - job.index },
        ),
      );
      // Conflict-tolerant: a URL whose canonical form was already saved (or
      // that two inputs resolved to) is skipped instead of aborting the batch
      // with a unique violation after earlier rows were committed. An id owned
      // by another user gets a fresh id and one retry.
      let row: LibraryItem | null = null;
      for (const id of [item.id, uid()]) {
        const inserted = await db
          .insert(articles)
          .values({
            id,
            userId: userId,
            url: item.url,
            canonicalUrl: item.canonicalUrl,
            title: item.title,
            author: item.author,
            siteName: item.siteName,
            source: item.source,
            wordCount: item.wordCount,
            readingMinutes: item.readingMinutes,
            excerpt: item.excerpt,
            contentHtml: item.contentHtml,
            heroImage: item.heroImage,
            published: item.published,
            savedAt: new Date(item.savedAt),
            archived: false,
            favorited: false,
            note: "",
            folderId: null,
            tags: [],
            highlights: [],
          })
          .onConflictDoNothing()
          .returning({ id: articles.id });
        if (inserted[0]) {
          row = { ...item, id };
          break;
        }
        const dup = await db
          .select({ id: articles.id })
          .from(articles)
          .where(
            and(
              eq(articles.userId, userId),
              or(eq(articles.canonicalUrl, item.canonicalUrl), eq(articles.url, item.url)),
            ),
          )
          .limit(1);
        if (dup[0]) break;
      }
      if (!row) {
        skipped.push(job.raw);
        continue;
      }
      // Strip bodies from the response — the client row hydrates the body from
      // the DB when the work is opened, keeping bulk payloads small.
      saved.push({ ...row, contentHtml: "" });
    }
  } finally {
    if (saved.length > 0) await invalidateUserCache(userId);
  }
  return { saved, skipped, errors };
}
