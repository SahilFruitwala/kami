import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { ExtractResult } from "@/lib/article-types.ts";

/**
 * Article extraction — turns a URL, a pasted body, or a browser-captured page
 * into an `Article`. Nothing is persisted here; the client saves the result
 * through the library item upsert.
 */

export const extractInput = z.object({
  url: z.string().trim().min(4, "Paste a URL first.").max(2000),
});

export const linkInput = z.object({
  url: z.string().trim().min(4, "Paste a URL first.").max(2000),
  title: z.string().trim().max(300).optional(),
});

export const importInput = z
  .object({
    url: z.string().trim().max(2000).optional(),
    title: z.string().trim().min(1).max(300),
    contentHtml: z.string().max(1_500_000).optional(),
    contentText: z.string().max(500_000).optional(),
    /** Whole page captured in the browser — run full extraction, not just sanitize. */
    capture: z.boolean().optional(),
  })
  .refine((data) => Boolean(data.contentHtml?.trim() || data.contentText?.trim()), {
    message: "Paste article HTML or plain text.",
  });

// Extraction performs server-side fetches (SSRF/egress surface): the route
// requires a signed-in user and the `extract` rate-limit bucket.
export async function extractArticle(data: z.output<typeof extractInput>): Promise<ExtractResult> {
  const { extractArticleFromUrl } = await import("@/lib/extract.server.ts");
  return extractArticleFromUrl(data.url);
}

export async function importArticle(data: z.output<typeof importInput>): Promise<ExtractResult> {
  const { articleFromCapturedPage, articleFromManualImport } =
    await import("@/lib/extract.server.ts");
  try {
    if (data.capture && data.contentHtml?.trim()) {
      const article = articleFromCapturedPage({
        url: data.url?.trim() || undefined,
        title: data.title,
        html: data.contentHtml,
      });
      return { ok: true, article };
    }
    const article = articleFromManualImport({
      url: data.url?.trim() || undefined,
      title: data.title,
      contentHtml: data.contentHtml?.trim() || undefined,
      contentText: data.contentText?.trim() || undefined,
    });
    return { ok: true, article };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not import that article.",
    };
  }
}

export async function saveLinkArticle(data: z.output<typeof linkInput>): Promise<ExtractResult> {
  const { articleFromLinkOnly } = await import("@/lib/extract.server.ts");
  try {
    const article = articleFromLinkOnly(data.url, data.title);
    return { ok: true, article };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid URL.",
    };
  }
}
