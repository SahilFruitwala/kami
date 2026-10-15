import { z } from "zod";

/** Feed request bodies (server validates; client derives types via `z.input`). */

export const addFeedInput = z.object({
  url: z.string().trim().min(4, "Paste a feed or site URL.").max(2000),
});
export const renameFeedInput = z.object({ title: z.string().trim().max(200).nullable() });
export const refreshInput = z.object({
  force: z.boolean().optional(),
  feedId: z.string().min(1).max(200).optional(),
});
export const markReadInput = z.object({ ids: z.array(z.string().min(1).max(200)).min(1).max(200) });
export const markAllReadInput = z.object({ feedId: z.string().max(200).optional() });
export const inboxInput = z.object({ rotate: z.boolean().optional() });
export const opmlInput = z.object({ opml: z.string().min(1).max(2_000_000) });
