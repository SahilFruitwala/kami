import { z } from "zod";
import {
  HIGHLIGHT_COLORS,
  LIBRARY_LIMITS as L,
  clampLibraryItem,
  normalizeTag,
  type HighlightColorId,
} from "@/lib/library-item";
import { isHttpUrl } from "@/lib/safe-url";

/**
 * Library request bodies. The server validates with these; the browser
 * client derives its request types from them with `import type` +
 * `z.input`, so client and server can't drift and Zod never ships to the
 * browser.
 */

const highlightColorIds = HIGHLIGHT_COLORS.map((c) => c.id) as [
  HighlightColorId,
  ...HighlightColorId[],
];

export const highlightSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(L.highlightText),
  note: z.string().max(L.highlightNote).default(""),
  createdAt: z.number(),
  color: z.enum(highlightColorIds).default("vermilion"),
});

const tagSchema = z.string().max(L.tagLength).transform(normalizeTag);

/**
 * Stored links must be plain http(s). The web reader is shielded by React
 * (which neuters `javascript:` hrefs), but native/mobile clients open these
 * with the OS (`Linking.openURL`, intents) and get no such protection.
 */
const httpUrlField = z
  .string()
  .min(1)
  .max(L.url)
  .refine(isHttpUrl, "Only http(s) links can be saved.");

export const tagOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), tag: tagSchema }),
  z.object({ op: z.literal("remove"), tag: tagSchema }),
  z.object({ op: z.literal("rename"), from: tagSchema, to: tagSchema }),
]);

export const highlightOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), highlight: highlightSchema }),
  z.object({ op: z.literal("remove"), id: z.string().min(1).max(200) }),
  z.object({
    op: z.literal("update"),
    id: z.string().min(1).max(200),
    color: z.enum(highlightColorIds).optional(),
    note: z.string().max(L.highlightNote).optional(),
  }),
]);

export const libraryItemSchema = z.object({
  // Extracted articles initially use the full URL as their id. The server may
  // replace it with a generated id when that global PK is already used by a
  // different user.
  id: z.string().min(1).max(L.id),
  url: httpUrlField,
  canonicalUrl: httpUrlField,
  title: z.string().min(1).max(L.title),
  author: z.string().max(L.author).default(""),
  siteName: z.string().max(L.siteName).default(""),
  source: z.enum(["blog", "x"]).default("blog"),
  wordCount: z.number().int().nonnegative().max(1_000_000).default(0),
  readingMinutes: z.number().int().positive().max(100_000).default(1),
  excerpt: z.string().max(L.excerpt).default(""),
  contentHtml: z.string().max(L.contentHtml).default(""),
  heroImage: z.string().max(L.heroImage).nullable().default(null),
  published: z.string().max(L.published).nullable().default(null),
  savedAt: z.number(),
  archived: z.boolean().default(false),
  tags: z.array(z.string().max(L.tagLength)).max(L.tags).default([]),
  folderId: z.string().max(200).nullable().default(null),
  highlights: z.array(highlightSchema).max(L.highlights).default([]),
  favorited: z.boolean().default(false),
  note: z.string().max(L.note).default(""),
});

export const libraryItemBody = z.preprocess(clampLibraryItem, libraryItemSchema);

export const libraryItemPatch = z.object({
  archived: z.boolean().optional(),
  favorited: z.boolean().optional(),
  note: z.string().max(L.note).optional(),
  folderId: z.string().max(200).nullable().optional(),
  /** Full replacement — prefer `tagOps` so concurrent edits merge. */
  tags: z.array(z.string().max(L.tagLength)).max(L.tags).optional(),
  /** Full replacement — prefer `highlightOps` so concurrent edits merge. */
  highlights: z.array(highlightSchema).max(L.highlights).optional(),
  tagOps: z.array(tagOpSchema).max(50).optional(),
  highlightOps: z.array(highlightOpSchema).max(50).optional(),
});

/** `POST /api/library/tags` — rename or remove one tag across the whole library. */
export const libraryTagOpBody = z.discriminatedUnion("op", [
  z.object({ op: z.literal("rename"), from: tagSchema, to: tagSchema }),
  z.object({ op: z.literal("remove"), tag: tagSchema }),
]);
