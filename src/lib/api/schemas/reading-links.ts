import { z } from "zod";
import { isIsoDay } from "@/lib/compass/dates";

/**
 * Reading → Compass links. A link says "when this changes, count it toward
 * that". A book can feed a done / not-done habit (progress) or a milestone
 * (finishing); a saved-post folder can feed a habit (archiving an article).
 */

const id = z.string().min(1).max(200);

export const LINK_MODES = ["ask", "auto", "off"] as const;
export type LinkMode = (typeof LINK_MODES)[number];

export const SOURCE_TYPES = ["book", "folder"] as const;
export const TARGET_TYPES = ["habit", "milestone"] as const;

/** Links for one source (`sourceType` + `sourceId`) or one target (`targetType` + `targetId`). */
export const linkQuery = z
  .object({
    sourceType: z.enum(SOURCE_TYPES).optional(),
    sourceId: id.optional(),
    targetType: z.enum(TARGET_TYPES).optional(),
    targetId: id.optional(),
  })
  .refine((q) => (!!q.sourceType && !!q.sourceId) || (!!q.targetType && !!q.targetId), {
    message: "Pass a source, or a target.",
  });

export const linkInput = z.object({
  sourceType: z.enum(SOURCE_TYPES),
  sourceId: id,
  targetType: z.enum(TARGET_TYPES).default("habit"),
  targetId: id,
  mode: z.enum(LINK_MODES).default("ask"),
});

export const linkPatch = z.object({ mode: z.enum(LINK_MODES) });

export const linkIdParams = z.object({ id });

/** Add (or, when negative, take back) reading on a day. Used by "Yes" and "Undo". */
export const contributionInput = z.object({
  day: z.string().refine(isIsoDay, "Use a real date (YYYY-MM-DD)."),
  delta: z
    .number()
    .min(-100_000)
    .max(100_000)
    .refine((n) => n !== 0, "Nothing to add."),
  unit: z.enum(["pages", "percent"]),
});

/** Mark a linked milestone done (or take that back). Used by "Yes" and "Undo". */
export const completeInput = z.object({ done: z.boolean() });

export const suggestionQuery = z.object({ bookId: id });
