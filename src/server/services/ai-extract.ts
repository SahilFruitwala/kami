import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { Article } from "@/lib/article-types.ts";
import type { ExtractFallback } from "@/lib/extract.server.ts";
import { aiConfigured } from "@/lib/llm.server.ts";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit.server.ts";
import { asDocument, generateJson } from "@/server/ai";

/**
 * AI fallback for page extraction: when Readability can't find the article
 * on a fetched page, number the page's readable blocks and let the model
 * pick the ranges that are the piece (skipping navigation, comments and
 * "related" lists). The text comes from the page as-is; the model never
 * writes it. Counts against the `ai` bucket and quietly steps aside when
 * AI is off, over budget, or unsure.
 */

const pickSchema = z.object({
  isArticle: z
    .boolean()
    .describe("True when the page has a readable piece (article, post, essay, docs page)."),
  title: z.string().describe("The piece's title, or empty."),
  author: z.string().describe("The author's name if shown, or empty."),
  ranges: z
    .array(z.object({ from: z.number().int(), to: z.number().int() }))
    .describe("Inclusive ranges of block numbers that make up the piece, in order."),
});

export function aiExtractFallback(userId: string): ExtractFallback | undefined {
  if (!aiConfigured()) return undefined;
  return async ({ html, url, source }): Promise<Article | null> => {
    const { buildArticle } = await import("@/lib/article-build.server.ts");
    const { collectContentBlocks, joinContentBlocks } = await import("@/lib/tidy-html.server.ts");
    const page = collectContentBlocks(html);
    if (page.blocks.length < 3) return null;
    try {
      await enforceRateLimit(userId, "ai");
    } catch (err) {
      if (err instanceof RateLimitError) return null;
      throw err;
    }

    const { output } = await generateJson(pickSchema, {
      instructions: [
        "You find the main piece of writing on a web page for a reading app.",
        "Below are the page's text blocks, numbered, each as a short preview.",
        "Return the ranges of blocks that form the piece itself: its headings, paragraphs, lists, quotes, code and figures.",
        "Leave out navigation, cookie and newsletter prompts, comments, author bios, share buttons and 'related' or 'more from' lists.",
      ].join("\n"),
      prompt: asDocument(page.previews.map((p, i) => `${i}. ${p}`).join("\n"), {
        title: page.title,
        url,
      }),
      maxOutputTokens: 500,
      temperature: 0,
    });
    if (!output.isArticle) return null;

    const keep = new Set<number>();
    for (const { from, to } of output.ranges) {
      const lo = Math.max(0, Math.min(from, to));
      const hi = Math.min(page.blocks.length - 1, Math.max(from, to));
      for (let i = lo; i <= hi; i++) keep.add(i);
    }
    const chosen = page.blocks.filter((_, i) => keep.has(i));
    if (!chosen.length) return null;
    return buildArticle({
      url,
      canonicalUrl: url,
      title: output.title.trim() || page.title,
      author: output.author.trim(),
      siteName: "",
      published: null,
      contentHtml: joinContentBlocks(chosen),
      source,
      heroImage: null,
    });
  };
}
