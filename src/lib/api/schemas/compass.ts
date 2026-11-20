import { z } from "zod";
import { GOAL_COLORS } from "@/lib/compass/colors";
import { isIsoDay, isValidTimeZone } from "@/lib/compass/dates";

export { GOAL_COLORS, type GoalColor } from "@/lib/compass/colors";

/**
 * Compass request bodies. The server validates with these; the browser client
 * derives its request types from them (`import type` + `z.input`).
 */

export const MAX_GOALS = 8;
export const MAX_MILESTONES = 12;
export const MAX_HABITS = 40;

const isoDay = z.string().refine(isIsoDay, "Use a real date (YYYY-MM-DD).");
const id = z.string().min(1).max(200);

export const scheduleInput = z.discriminatedUnion("rule", [
  z.object({ rule: z.literal("daily") }),
  z.object({
    rule: z.literal("days"),
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1, "Pick at least one day.")
      .max(7)
      .transform((d) => [...new Set(d)].sort()),
  }),
  z.object({ rule: z.literal("per_week"), perWeek: z.number().int().min(1).max(7) }),
]);

export const settingsInput = z.object({
  timezone: z.string().max(80).refine(isValidTimeZone, "Unknown timezone.").optional(),
  weekStart: z.union([z.literal(0), z.literal(1)]).optional(),
});

const milestoneInput = z.object({
  /** Present for a milestone that already exists (keeps its done state). */
  id: id.optional(),
  title: z.string().trim().min(1, "Name the milestone.").max(160),
  dueOn: isoDay.nullable().optional(),
  weight: z.enum(["S", "M", "L"]).default("M"),
});

export const goalInput = z.object({
  name: z.string().trim().min(1, "Name the goal.").max(120),
  why: z.string().trim().max(400).nullable().optional(),
  color: z.enum(GOAL_COLORS).default("persimmon"),
  milestones: z.array(milestoneInput).max(MAX_MILESTONES).default([]),
  /** Create in the next quarter (only while planning is open). Ignored on update. */
  quarter: z.literal("next").optional(),
});

export const milestonePatch = z.object({ done: z.boolean() });

export const habitInput = z
  .object({
    name: z.string().trim().min(1, "Name the habit.").max(120),
    /** Null = an ongoing habit with no goal. */
    goalId: id.nullable(),
    kind: z.enum(["check", "count"]).default("check"),
    target: z.number().positive().max(1_000_000).nullable().optional(),
    unit: z.string().trim().max(24).nullable().optional(),
    schedule: scheduleInput,
  })
  .refine((h) => h.kind === "check" || (h.target ?? 0) > 0, {
    message: "Set a daily target for an amount.",
    path: ["target"],
  });

export const habitPatch = z.object({
  name: z.string().trim().min(1, "Name the habit.").max(120).optional(),
  goalId: id.nullable().optional(),
  kind: z.enum(["check", "count"]).optional(),
  target: z.number().positive().max(1_000_000).nullable().optional(),
  unit: z.string().trim().max(24).nullable().optional(),
  schedule: scheduleInput.optional(),
  paused: z.boolean().optional(),
  archived: z.literal(true).optional(),
});

export const logInput = z.object({
  habitId: id,
  day: isoDay,
  /** 0 clears the day. 1 = done for a done/not-done habit; the amount for a counted one. */
  value: z.number().min(0).max(1_000_000),
});

export const quarterParams = z.object({
  quarter: z.string().regex(/^\d{4}-q[1-4]$/, "Use a quarter like 2026-q4."),
});

export const reviewInput = z.object({
  weekStart: isoDay,
  answers: z.object({
    moved: z.string().trim().max(1000).default(""),
    blocked: z.string().trim().max(1000).default(""),
    change: z.string().trim().max(1000).default(""),
  }),
});

export const RETRO_OUTCOMES = ["done", "carried", "dropped"] as const;

export const retroInput = z.object({
  quarter: z.string().regex(/^\d{4}-q[1-4]$/),
  decisions: z.array(z.object({ goalId: id, outcome: z.enum(RETRO_OUTCOMES) })).max(MAX_GOALS),
  note: z.string().trim().max(2000).nullable().optional(),
});
