import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ExtractResult } from "./article-types.ts";

const urlInput = z.object({
  url: z.string().trim().min(4, "Paste a URL first."),
});

export const extractArticle = createServerFn({ method: "POST" })
  .validator((input: unknown) => urlInput.parse(input))
  .handler(async ({ data }): Promise<ExtractResult> => {
    const { extractArticleFromUrl } = await import("./extract.server.ts");
    return extractArticleFromUrl(data.url);
  });
