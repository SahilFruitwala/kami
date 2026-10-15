import { z } from "zod";

/** Shelf request bodies (server validates; client derives types via `z.input`). */

export const shelfType = z.enum(["movie", "tv", "book", "wishlist", "restaurant", "place"]);
export const shelfStatus = z.enum(["to_try", "in_progress", "done", "abandoned"]);

export const addShelfItemInput = z.object({
  type: shelfType,
  title: z.string().min(1).max(300),
  notes: z.string().max(2000).optional(),
  link: z.string().max(2000).optional(),
  imageUrl: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  status: z.enum(["to_try", "done"]).default("to_try"),
});

/** Drop oversize optional URLs before Zod max caps reject the whole insert. */
export function clampShelfItemInput(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const o = input as Record<string, unknown>;
  const trimCap = (v: unknown, max: number) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (!t) return undefined;
    return t.length <= max ? t : undefined;
  };
  return {
    ...o,
    title: typeof o.title === "string" ? o.title.trim().slice(0, 300) : o.title,
    notes: typeof o.notes === "string" ? o.notes.slice(0, 2000) : o.notes,
    link: trimCap(o.link, 2000),
    imageUrl: trimCap(o.imageUrl, 2000),
  };
}

/** `POST /api/shelves/:type` body — the type lives in the path. */
export const addShelfItemFields = addShelfItemInput.omit({ type: true });
export const addShelfItemBody = z.preprocess(clampShelfItemInput, addShelfItemFields);

export const statusBody = z.object({ status: shelfStatus });

export const bookProgressBody = z
  .union([
    z.object({
      mode: z.literal("pages"),
      currentPage: z.number().int().min(0).max(100_000),
      pageCount: z.number().int().min(1).max(100_000),
    }),
    z.object({
      mode: z.literal("percent"),
      percent: z.number().int().min(0).max(100),
    }),
  ])
  .refine((d) => d.mode !== "pages" || d.currentPage <= d.pageCount, {
    message: "Current page can't be past the last page.",
  });

/** `POST /api/shelves/book/import` — rows parsed client-side from a Goodreads or StoryGraph export. */
export const importBooksBody = z.object({
  source: z.enum(["goodreads", "storygraph"]).default("goodreads"),
  books: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(500),
        author: z.string().trim().max(300).optional(),
        isbn: z
          .string()
          .regex(/^(\d{9}[\dX]|\d{13})$/)
          .optional(),
        year: z.number().int().min(1).max(3000).optional(),
        pages: z.number().int().min(1).max(100_000).optional(),
        status: shelfStatus,
        // Goodreads rates in whole stars, StoryGraph in quarter stars.
        rating: z.number().min(0.25).max(5).multipleOf(0.25).optional(),
        goodreadsId: z
          .string()
          .regex(/^\d{1,20}$/)
          .optional(),
        dateAdded: z.iso.date().optional(),
        dateRead: z.iso.date().optional(),
        review: z.string().max(20_000).optional(),
      }),
    )
    .max(10_000),
});
