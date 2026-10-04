import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { rateLimited } from "@/lib/rate-limit-middleware.ts";
import type { ExtractResult } from "./article-types.ts";

const urlInput = z.object({
  url: z.string().trim().min(4, "Paste a URL first.").max(2000),
});

const linkInput = z.object({
  url: z.string().trim().min(4, "Paste a URL first.").max(2000),
  title: z.string().trim().max(300).optional(),
});

const importInput = z
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

// Extraction performs server-side fetches (SSRF/egress surface) and is only
// used behind AppGate — require a signed-in user like every other mutation.
export const extractArticle = createServerFn({ method: "POST" })
  .middleware([rateLimited("extract")])
  .validator((input: unknown) => urlInput.parse(input))
  .handler(async ({ data }): Promise<ExtractResult> => {
    const { extractArticleFromUrl } = await import("./extract.server.ts");
    return extractArticleFromUrl(data.url);
  });

export const importArticle = createServerFn({ method: "POST" })
  .middleware([rateLimited("extract")])
  .validator((input: unknown) => importInput.parse(input))
  .handler(async ({ data }): Promise<ExtractResult> => {
    const { articleFromCapturedPage, articleFromManualImport } = await import("./extract.server.ts");
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
  });

export const saveLinkArticle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => linkInput.parse(input))
  .handler(async ({ data }): Promise<ExtractResult> => {
    const { articleFromLinkOnly } = await import("./extract.server.ts");
    try {
      const article = articleFromLinkOnly(data.url, data.title);
      return { ok: true, article };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Invalid URL.",
      };
    }
  });
