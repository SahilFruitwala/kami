import "@tanstack/react-start/server-only";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import type { SaveUrlResult } from "@/lib/api/types";
import { getDb } from "@/lib/db";
import { articles } from "@/lib/schema";
import { getArticle, libraryItemBody, upsertLibraryItem } from "@/server/services/library";

/**
 * Save a link to the library in one server-side step: fetch + extract the page
 * here and store the clean copy. This is the save path for every client — the
 * web app's "paste a link" box and any native/mobile app (which authenticates
 * with a Clerk session token as `Authorization: Bearer …`). The client sends
 * only a URL, never article HTML, so nothing it supplies ends up in the reader.
 */
export const saveUrlInput = z.object({
  url: z.string().trim().min(4, "Paste a URL first.").max(2000),
  /** Store a link-only stub (no fetch now); the reader extracts on open. */
  linkOnly: z.boolean().optional(),
});

async function findSavedId(userId: string, hrefs: string[]): Promise<string | null> {
  const targets = [...new Set(hrefs.filter(Boolean))];
  if (!targets.length) return null;
  const db = await getDb();
  const [row] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(
      and(
        eq(articles.userId, userId),
        or(...targets.flatMap((href) => [eq(articles.url, href), eq(articles.canonicalUrl, href)])),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

export async function saveArticleByUrl(
  userId: string,
  data: z.output<typeof saveUrlInput>,
): Promise<SaveUrlResult> {
  const { assertPublicHttpUrl } = await import("@/lib/safe-url.ts");
  let href: string;
  try {
    href = assertPublicHttpUrl(data.url).href;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That URL can't be saved." };
  }

  // Already saved → hand back the stored row; never overwrite its tags,
  // highlights or notes with a fresh extraction.
  const known = await findSavedId(userId, [href]);
  if (known) return { ok: true, item: await getArticle(userId, known), existed: true };

  const { articleFromLinkOnly, extractArticleFromUrl } = await import("@/lib/extract.server.ts");
  let article;
  if (data.linkOnly) {
    try {
      article = articleFromLinkOnly(href);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Invalid URL." };
    }
  } else {
    const result = await extractArticleFromUrl(href);
    if (!result.ok) return result;
    article = result.article;
  }

  // Redirects / canonical links can land on a URL that is already saved.
  const canonical = await findSavedId(userId, [article.url, article.canonicalUrl]);
  if (canonical) return { ok: true, item: await getArticle(userId, canonical), existed: true };

  const { articleToItem } = await import("@/lib/store.ts");
  const item = await upsertLibraryItem(userId, libraryItemBody.parse(articleToItem(article)));
  return { ok: true, item, existed: false };
}
