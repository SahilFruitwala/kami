import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Article, EpubResult, ExtractResult } from "./article-types.ts";

const urlInput = z.object({
  url: z.string().trim().min(4, "Paste a URL first."),
});

const articleSchema = z.object({
  url: z.string(),
  canonicalUrl: z.string(),
  title: z.string(),
  author: z.string(),
  siteName: z.string(),
  published: z.string().nullable(),
  excerpt: z.string(),
  contentHtml: z.string(),
  wordCount: z.number(),
  readingMinutes: z.number(),
  source: z.enum(["blog", "x"]),
  heroImage: z.string().nullable(),
});

export const extractArticle = createServerFn({ method: "POST" })
  .validator((input: unknown) => urlInput.parse(input))
  .handler(async ({ data }): Promise<ExtractResult> => {
    const { extractArticleFromUrl } = await import("./extract.server.ts");
    return extractArticleFromUrl(data.url);
  });

export const bindEpub = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ article: articleSchema }).parse(input))
  .handler(async ({ data }): Promise<EpubResult> => {
    const { buildEpub } = await import("./epub.server.ts");
    return buildEpub(data.article as Article);
  });
