import { canReserve, unspoken } from "./allowance.ts";
import type { TidyState } from "./tidy-state.ts";

/**
 * The narration engine, pure. The run loop (narration service) asks
 * `nextStep` what to do, does it (tidy, speak a part, join, hand off), and
 * folds the result back in with `applyEvent`. Every decision about resuming,
 * leases, time budgets, pausing and refusing lives here so it can be tested
 * without I/O. Tested in scripts/narration-engine.test.mjs.
 *
 *   queued → tidying → narrating ⟲ → joining → ready
 *                         ↓  ↑ Resume
 *                        paused
 */

export const NARRATION_STATES = [
  "queued",
  "tidying",
  "narrating",
  "joining",
  "ready",
  "paused",
] as const;
export type NarrationState = (typeof NARRATION_STATES)[number];

/** States in which a run is (or should be) making progress. */
export const ACTIVE_STATES: readonly NarrationState[] = [
  "queued",
  "tidying",
  "narrating",
  "joining",
];

/**
 * One part (2,000 characters, about two minutes of speech) takes Deepgram
 * about a minute to synthesise. A speech call is cut off at
 * SPEECH_TIMEOUT_MS; a step's budget covers that plus the R2 write; and the
 * lease outlives a whole step so no second run can start mid-part.
 */
export const SPEECH_TIMEOUT_MS = 150_000;
/** Worst case for one step (a Deepgram call plus an R2 write) with margin. */
export const STEP_BUDGET_MS = 180_000;
/** How long a run's claim lasts without renewal. Renewed after every step. */
export const LEASE_MS = 240_000;
/** Joining reads every part, so it gets room too. */
export const JOIN_BUDGET_MS = 90_000;

export type Narration = {
  state: NarrationState;
  pausedReason: string | null;
  /** The script, split into Narration parts. */
  parts: string[];
  partsDone: number;
  /** Characters set aside when the narration started. */
  reservedChars: number;
  /** Characters actually spoken so far. */
  charsSpoken: number;
  /** Whether this narration has already given Tidy its chance. */
  tidyAttempted: boolean;
  leaseUntil: number | null;
  runId: string | null;
};

export type StepContext = {
  now: number;
  /** This run's id; a lease held by another id blocks it. */
  runId: string;
  /** Time left before the platform stops this invocation. */
  timeLeftMs: number;
  /** The article's tidy state right now. */
  tidyState: TidyState;
  /** The narration (or its article) was deleted mid-run. */
  deleted: boolean;
};

export type Action =
  | { type: "exit"; reason: "deleted" | "ready" | "paused" | "lease-held" }
  | { type: "hand-off" }
  | { type: "tidy" }
  | { type: "speak"; index: number }
  | { type: "join" };

export type NarrationEvent =
  | { type: "claimed"; runId: string; now: number }
  | { type: "tidying" }
  | { type: "tidied"; parts: string[] | null }
  | { type: "spoken"; index: number; chars: number; now: number }
  | { type: "joined" }
  | { type: "failed"; reason: string };

export function isActive(state: NarrationState): boolean {
  return ACTIVE_STATES.includes(state);
}

/** May `runId` take over this narration? Free, expired, or already its own. */
export function canClaim(n: Narration, runId: string, now: number): boolean {
  if (!isActive(n.state)) return false;
  return n.leaseUntil === null || n.leaseUntil <= now || n.runId === runId;
}

/** A narration whose run died: active, but nobody holds a live lease. */
export function isStalled(n: Narration, now: number): boolean {
  return isActive(n.state) && (n.leaseUntil === null || n.leaseUntil <= now);
}

export function nextStep(n: Narration, ctx: StepContext): Action {
  if (ctx.deleted) return { type: "exit", reason: "deleted" };
  if (n.state === "ready") return { type: "exit", reason: "ready" };
  if (n.state === "paused") return { type: "exit", reason: "paused" };
  if (n.leaseUntil !== null && n.leaseUntil > ctx.now && n.runId !== ctx.runId) {
    return { type: "exit", reason: "lease-held" };
  }
  const joining = n.partsDone >= n.parts.length;
  if (ctx.timeLeftMs < (joining ? JOIN_BUDGET_MS : STEP_BUDGET_MS)) return { type: "hand-off" };
  const needsTidy = ctx.tidyState === "pending" || ctx.tidyState === "failed";
  if (!n.tidyAttempted && n.partsDone === 0 && needsTidy) return { type: "tidy" };
  if (!joining) return { type: "speak", index: n.partsDone };
  return { type: "join" };
}

export function applyEvent(n: Narration, event: NarrationEvent): Narration {
  switch (event.type) {
    case "claimed":
      return {
        ...n,
        runId: event.runId,
        leaseUntil: event.now + LEASE_MS,
        state: n.state === "queued" ? "narrating" : n.state,
      };
    case "tidying":
      return { ...n, state: "tidying" };
    case "tidied": {
      // Tidy only removes text, so the rebuilt script can only shrink; keep
      // the original if something unexpected made it longer.
      const chars = event.parts?.reduce((sum, p) => sum + p.length, 0) ?? 0;
      const swap =
        event.parts !== null &&
        event.parts.length > 0 &&
        n.partsDone === 0 &&
        chars <= n.reservedChars;
      return {
        ...n,
        tidyAttempted: true,
        parts: swap ? event.parts! : n.parts,
        state: "narrating",
      };
    }
    case "spoken":
      if (event.index !== n.partsDone) return n;
      return {
        ...n,
        state: event.index + 1 >= n.parts.length ? "joining" : "narrating",
        partsDone: n.partsDone + 1,
        charsSpoken: n.charsSpoken + event.chars,
        leaseUntil: event.now + LEASE_MS,
      };
    case "joined":
      return { ...n, state: "ready", pausedReason: null, leaseUntil: null, runId: null };
    case "failed":
      return { ...n, state: "paused", pausedReason: event.reason, leaseUntil: null, runId: null };
  }
}

/** Resume a paused narration from its last finished part. */
export function resume(n: Narration): Narration {
  if (n.state !== "paused") return n;
  return {
    ...n,
    state: n.partsDone >= n.parts.length ? "joining" : "narrating",
    pausedReason: null,
    leaseUntil: null,
    runId: null,
  };
}

/** What returns to the allowance when a narration ends (finished or deleted). */
export function settleReservation(n: Pick<Narration, "reservedChars" | "charsSpoken">): number {
  return unspoken({ reserved: n.reservedChars, spoken: n.charsSpoken });
}

export type Refusal =
  | { code: "stub" }
  | { code: "unsupported_language" }
  | { code: "too_long"; chars: number; limit: number }
  | { code: "no_allowance"; needed: number; available: number };

/** Everything that stops a narration before any Deepgram call, checked in order. */
export function refuseStart(input: {
  isStub: boolean;
  english: boolean;
  chars: number;
  limit: number;
  available: number;
}): Refusal | null {
  if (input.isStub || input.chars === 0) return { code: "stub" };
  if (!input.english) return { code: "unsupported_language" };
  if (input.chars > input.limit)
    return { code: "too_long", chars: input.chars, limit: input.limit };
  if (!canReserve(input.available, input.chars)) {
    return { code: "no_allowance", needed: input.chars, available: input.available };
  }
  return null;
}

/** What pressing Create audio means given the article's current narration. */
export function startKind(
  existing: Pick<Narration, "state"> | null,
  stale: boolean,
): "create" | "resume" | "running" | "ready" | "recreate" {
  if (!existing) return "create";
  if (existing.state === "paused") return "resume";
  if (isActive(existing.state)) return "running";
  return stale ? "recreate" : "ready";
}
