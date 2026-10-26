import type { Depth, RunState, RunStopReason } from "./kinds.ts";
import { chargedCredits, type RunSpend } from "./credits.ts";

/**
 * The research run engine, pure. The run loop (research runs service) asks
 * `nextAction` what to do, does it (one unit of a step, a hand-off, or the
 * finish), and writes the result back. Every decision about leases, time,
 * stopping and step order lives here so it can be tested without I/O.
 * Tested in tests/research-run-engine.test.mjs. Same shape as
 * src/lib/narration-engine.ts.
 *
 *   drafting → awaiting_plan → queued → running ⟲ → done | stopped | failed
 *
 * A run walks its steps in order. Each step does its work in units and
 * saves each unit's output before the next, so a fresh invocation resumes
 * at `step` and never repeats a paid call. Once a run is stopping (budget
 * reached, or the user pressed Stop) only its `final` steps still run, so
 * whatever it gathered is scored and kept.
 */

/** Marks a run whose steps are all done; the next action is to finish. */
export const END_STEP = "end";

/** Worst case for one unit of work when a step doesn't say (a model call or a page read, with margin). */
export const DEFAULT_UNIT_BUDGET_MS = 120_000;
/** How long a run's claim lasts without renewal. Renewed after every unit; outlives any unit. */
export const LEASE_MS = 180_000;

/** Budgets per depth, in research credits _(start values, tuned in ticket 09)_. */
export const DEPTH_BUDGETS: Record<Depth, number> = { quick: 30, deep: 100 };

/** States in which a run is (or should be) making progress in the background. */
export const ACTIVE_RUN_STATES: readonly RunState[] = ["queued", "running"];
/** States from which a run never moves again. */
export const TERMINAL_RUN_STATES: readonly RunState[] = ["done", "stopped", "failed"];

export type StepInfo = { name: string; final?: boolean; unitBudgetMs?: number };

export type EngineRun = {
  state: RunState;
  /** The step to work on next; null before the first, END_STEP after the last. */
  step: string | null;
  stopReason: RunStopReason | null;
  stopRequested: boolean;
  leaseUntil: number | null;
  runLease: string | null;
};

export type ActionContext = {
  now: number;
  /** This invocation's lease id; a live lease held by another id blocks it. */
  lease: string;
  /** Time left before the platform stops this invocation. */
  timeLeftMs: number;
};

export type RunAction =
  | { type: "exit"; reason: "inactive" | "lease-held" }
  | { type: "hand-off" }
  | { type: "work"; step: string }
  | { type: "finish"; state: "done" | "stopped"; stopReason: RunStopReason | null };

export function isActiveRun(state: RunState): boolean {
  return ACTIVE_RUN_STATES.includes(state);
}

export function isTerminalRun(state: RunState): boolean {
  return TERMINAL_RUN_STATES.includes(state);
}

/** An active run whose invocation died: nobody holds a live lease. */
export function isStalledRun(run: Pick<EngineRun, "state" | "leaseUntil">, now: number): boolean {
  return isActiveRun(run.state) && (run.leaseUntil === null || run.leaseUntil <= now);
}

export function isStopping(run: Pick<EngineRun, "stopReason" | "stopRequested">): boolean {
  return run.stopReason !== null || run.stopRequested;
}

/**
 * The step to work on given where the run is: its saved step (or the first),
 * skipping non-final steps once it is stopping. END_STEP when nothing is left.
 */
export function currentStep(steps: StepInfo[], run: EngineRun): string {
  if (run.step === END_STEP) return END_STEP;
  const from = run.step === null ? 0 : steps.findIndex((s) => s.name === run.step);
  if (from === -1) throw new Error(`unknown research step "${run.step}"`);
  const stopping = isStopping(run);
  const next = steps.slice(from).find((s) => !stopping || s.final);
  return next?.name ?? END_STEP;
}

/** Where to go once `step` has nothing left to do. */
export function stepAfter(steps: StepInfo[], step: string, stopping: boolean): string {
  const at = steps.findIndex((s) => s.name === step);
  if (at === -1) throw new Error(`unknown research step "${step}"`);
  const next = steps.slice(at + 1).find((s) => !stopping || s.final);
  return next?.name ?? END_STEP;
}

export function nextAction(steps: StepInfo[], run: EngineRun, ctx: ActionContext): RunAction {
  if (!isActiveRun(run.state)) return { type: "exit", reason: "inactive" };
  if (run.leaseUntil !== null && run.leaseUntil > ctx.now && run.runLease !== ctx.lease) {
    return { type: "exit", reason: "lease-held" };
  }
  const step = currentStep(steps, run);
  if (step === END_STEP) {
    const stopReason = run.stopReason ?? (run.stopRequested ? "user" : null);
    return { type: "finish", state: stopReason ? "stopped" : "done", stopReason };
  }
  const info = steps.find((s) => s.name === step);
  if (ctx.timeLeftMs < (info?.unitBudgetMs ?? DEFAULT_UNIT_BUDGET_MS)) return { type: "hand-off" };
  return { type: "work", step };
}

/** Credits a run has spent so far, counted the way it will be charged. */
export function spentCredits(spend: RunSpend, tokensPerCredit: number): number {
  return chargedCredits(spend, Number.MAX_SAFE_INTEGER, tokensPerCredit);
}

/**
 * Whether a call whose worst case is `next` fits what is left of the
 * budget. Checked before every paid call, so a run never goes over its
 * reservation.
 */
export function fitsBudget(
  spent: RunSpend,
  next: Partial<RunSpend>,
  budget: number,
  tokensPerCredit: number,
): boolean {
  const total: RunSpend = {
    firecrawlCredits: spent.firecrawlCredits + (next.firecrawlCredits ?? 0),
    tokensIn: spent.tokensIn + (next.tokensIn ?? 0),
    tokensOut: spent.tokensOut + (next.tokensOut ?? 0),
  };
  return spentCredits(total, tokensPerCredit) <= budget;
}
