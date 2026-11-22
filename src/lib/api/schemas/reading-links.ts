import { z } from "zod";
import { isIsoDay } from "@/lib/compass/dates";

/**
 * Reading → Compass links. A link says "when this book moves, count it toward
 * that habit". Only books and done/not-done habits for now.
 */

const id = z.string().min(1).max(200);

export const LINK_MODES = ["ask", "auto", "off"] as const;
export type LinkMode = (typeof LINK_MODES)[number];

export const linkQuery = z.object({
  sourceType: z.literal("book"),
  sourceId: id,
});

export const linkInput = z.object({
  sourceType: z.literal("book"),
  sourceId: id,
  habitId: id,
  mode: z.enum(LINK_MODES).default("ask"),
});

export const linkPatch = z.object({ mode: z.enum(LINK_MODES) });

export const linkIdParams = z.object({ id });

/** Add (or, when negative, take back) reading on a day. Used by "Log it" and "Undo". */
export const contributionInput = z.object({
  day: z.string().refine(isIsoDay, "Use a real date (YYYY-MM-DD)."),
  delta: z
    .number()
    .min(-100_000)
    .max(100_000)
    .refine((n) => n !== 0, "Nothing to add."),
  unit: z.enum(["pages", "percent"]),
});
