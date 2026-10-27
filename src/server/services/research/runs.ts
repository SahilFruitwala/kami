import "@tanstack/react-start/server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { getDeadline } from "@vercel/functions";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db.server";
import { PageReadError } from "@/lib/page-read-error.ts";
import { enforceRateLimit } from "@/lib/rate-limit.server.ts";
import type { ResearchConfig } from "@/lib/research-config.server.ts";
import { ResearchCreditsShortError, reserveRunCredits } from "@/lib/research-credits-db.server.ts";
import { pruneModelCache } from "@/lib/research-model-cache-db.server.ts";
import {
  createRun,
  createTopic,
  getRun,
  getTopic,
  touchTopic,
  type RunRow,
  type TopicRow,
} from "@/lib/research-db.server.ts";
import {
  addRunSpend,
  claimRun,
  getRunById,
  mergeRunProgress,
  updateLeasedRun,
  type RunPatch,
} from "@/lib/research-runs-db.server.ts";
import type { RunSpend } from "@/lib/research/credits.ts";
import type {
  Depth,
  DiscoverInput,
  PlanQuery,
  RunKind,
  RunProgress,
} from "@/lib/research/kinds.ts";
import {
  DEPTH_BUDGETS,
  LEASE_MS,
  LINK_BUDGET,
  fitsBudget,
  isStalledRun,
  isStopping,
  nextAction,
  stepAfter,
  type EngineRun,
  type StepInfo,
} from "@/lib/research/run-engine.ts";
import { researchRuns } from "@/lib/schema";
import { runInBackground } from "@/server/background";
import { HttpError, conflict, notFound } from "@/server/http";
import { currentResearchConfig, settleRun } from "./credits";

/**
 * Research runs: drafting a plan, starting, stopping, and the background
 * loop that walks a run's steps. The decisions live in the pure engine
 * (src/lib/research/run-engine.ts); this module does the I/O around it.
 * Every entry point is scoped to the caller's own runs; a run continues in
 * the background with waitUntil and re-invokes itself before the function's
 * time runs out (docs/adr/0001, same as narration).
 */

/** Without a platform deadline (local dev), give each invocation this long. */
const FALLBACK_RUN_MS = 240_000;

/** Shown when a step fails with an error that wasn't written for people. */
const GENERIC_RUN_ERROR = "Something went wrong during this run. What it found so far is kept.";

/** A paid call would take the run past its budget; the run stops and scores what it has. */
export class BudgetExceededError extends Error {
  constructor() {
    super("This run reached its budget.");
    this.name = "BudgetExceededError";
  }
}

/** A step failure whose message is safe to show the user. */
export class RunStepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunStepError";
  }
}

/** Another invocation took the run over (or it was deleted); this one stops quietly. */
class LeaseLostError extends Error {
  constructor() {
    super("lease lost");
    this.name = "LeaseLostError";
  }
}

export type StepContext = {
  /** The run as of the start of this unit (spend kept current by `recordSpend`). */
  run: RunRow;
  config: ResearchConfig;
  /** Throws BudgetExceededError unless a call with this worst case still fits the budget. */
  ensureBudget(worstCase: Partial<RunSpend>): void;
  /** Count what a call actually spent. Call it right after the call, before saving output. */
  recordSpend(spend: Partial<RunSpend>): Promise<void>;
  /** Merge counters into the run's progress for the run view. */
  saveProgress(patch: RunProgress): Promise<void>;
};

/** The part of a step's context that meters spend (what Firecrawl and model calls take). */
export type Meter = Pick<StepContext, "ensureBudget" | "recordSpend">;

export type ResearchStep = StepInfo & {
  /**
   * Do one unit of work and save its output; return true when the step has
   * nothing left. Must be idempotent: a resumed run calls it again, and it
   * should find what is already saved and skip it.
   */
  work(ctx: StepContext): Promise<boolean>;
};

const STEPS: Partial<Record<RunKind, ResearchStep[]>> = {};

/** Each run kind registers its steps once, at module load (Discover in its own module). */
export function registerRunSteps(kind: RunKind, steps: ResearchStep[]) {
  STEPS[kind] = steps;
}

function requireConfig(): ResearchConfig {
  const config = currentResearchConfig();
  if (!config) throw new HttpError(503, "Research isn't set up on this server.");
  return config;
}

function toEngine(row: RunRow): EngineRun {
  return {
    state: row.state,
    step: row.step,
    stopReason: row.stopReason,
    stopRequested: Boolean(row.progress?.stopRequested),
    leaseUntil: row.leaseUntil ? row.leaseUntil.getTime() : null,
    runLease: row.runLease,
  };
}

// ---------- Draft, start, stop, status ----------

export type DraftResult = { plan: PlanQuery[]; tokensIn: number; tokensOut: number };

/**
 * Create a run (and its topic, when none is given) and draft its plan with
 * `drafter`. Spends no Firecrawl credits and reserves nothing; the plan's
 * tokens are recorded on the run and charged only if it runs.
 */
export async function draftRun(
  userId: string,
  request: { topicId?: string; kind: RunKind; input: DiscoverInput; depth: Depth },
  drafter: (run: RunRow, topic: TopicRow) => Promise<DraftResult>,
): Promise<{ run: RunRow; topic: TopicRow }> {
  requireConfig();
  await enforceRateLimit(userId, "research");
  const db = await getDb();
  const topic = request.topicId
    ? await getTopic(db, userId, request.topicId)
    : await createTopic(db, userId, request.input.seed);
  if (!topic) throw notFound("Topic not found");
  const run = await createRun(db, userId, topic.id, {
    kind: request.kind,
    depth: request.depth,
    input: request.input,
  });

  let draft: DraftResult;
  try {
    draft = await drafter(run, topic);
  } catch (err) {
    console.error("[research] plan drafting failed", err);
    const message =
      err instanceof RunStepError ? err.message : "Couldn't draft a plan. Try again in a moment.";
    await db
      .update(researchRuns)
      .set({
        state: "failed",
        stopReason: "error",
        error: message,
        chargedCredits: 0,
        finishedAt: new Date(),
      })
      .where(eq(researchRuns.id, run.id));
    throw new HttpError(502, message);
  }

  const [drafted] = await db
    .update(researchRuns)
    .set({
      state: "awaiting_plan",
      plan: draft.plan,
      tokensIn: Math.max(0, Math.round(draft.tokensIn)),
      tokensOut: Math.max(0, Math.round(draft.tokensOut)),
    })
    .where(eq(researchRuns.id, run.id))
    .returning();
  return { run: drafted, topic };
}

/**
 * Start a drafted run with its final plan: reserve its whole budget and
 * queue it, in one transaction, then continue in the background.
 */
export async function startRun(
  userId: string,
  runId: string,
  final: { plan: PlanQuery[]; depth: Depth },
  origin: string,
): Promise<RunRow> {
  requireConfig();
  await enforceRateLimit(userId, "research");
  const db = await getDb();
  const budget = DEPTH_BUDGETS[final.depth];
  let queued: RunRow | undefined;
  try {
    await db.transaction(async (tx) => {
      [queued] = await tx
        .update(researchRuns)
        .set({ state: "queued", plan: final.plan, depth: final.depth })
        .where(
          and(
            eq(researchRuns.id, runId),
            eq(researchRuns.userId, userId),
            eq(researchRuns.state, "awaiting_plan"),
          ),
        )
        .returning();
      if (!queued) return;
      await reserveRunCredits(db, userId, runId, budget, "run started", tx);
    });
  } catch (err) {
    if (err instanceof ResearchCreditsShortError) {
      throw new HttpError(
        402,
        `This run needs ${budget} research credits; you have ${err.available}.`,
      );
    }
    throw err;
  }
  if (!queued) {
    const existing = await getRun(db, userId, runId);
    if (!existing) throw notFound("Run not found");
    throw conflict("This run has already started.");
  }
  kickRun(runId, origin);
  return (await getRun(db, userId, runId)) ?? queued;
}

/**
 * Paste a link (spec §4.11): a small run in the topic that reads only `url`
 * and then extracts, matches and scores like any run. It has no plan and
 * starts at `fetch`, under its own small budget. A page the topic already
 * has comes from the cache for free, and its quotes are never stored twice.
 */
export async function startLinkRun(
  userId: string,
  topicId: string,
  url: string,
  origin: string,
): Promise<RunRow> {
  const run = await createLinkRun(userId, topicId, url);
  kickRun(run.id, origin);
  return run;
}

/** `startLinkRun` without starting it: the run is queued with its budget set aside. */
export async function createLinkRun(userId: string, topicId: string, url: string): Promise<RunRow> {
  requireConfig();
  await enforceRateLimit(userId, "research");
  const db = await getDb();
  const topic = await getTopic(db, userId, topicId);
  if (!topic) throw notFound("Topic not found");
  const id = randomUUID();
  let row: RunRow | undefined;
  try {
    await db.transaction(async (tx) => {
      [row] = await tx
        .insert(researchRuns)
        .values({
          id,
          userId,
          topicId,
          kind: "discover",
          depth: "quick",
          state: "queued",
          step: "fetch",
          input: { seed: topic.name, link: url },
          progress: { toRead: [url] },
        })
        .returning();
      await reserveRunCredits(db, userId, id, LINK_BUDGET, "link added", tx);
    });
  } catch (err) {
    if (err instanceof ResearchCreditsShortError) {
      throw new HttpError(
        402,
        `Reading a link needs ${LINK_BUDGET} research credits; you have ${err.available}.`,
      );
    }
    throw err;
  }
  // Read it back: the reservation set its budget after the insert.
  return (await getRun(db, userId, id)) ?? (row as RunRow);
}

/**
 * Stop a run. A run that hasn't started just ends; a running one is asked to
 * stop between units, then scores what it has and settles like a budget stop.
 */
export async function requestStop(userId: string, runId: string, origin: string): Promise<RunRow> {
  const db = await getDb();
  const run = await getRun(db, userId, runId);
  if (!run) throw notFound("Run not found");

  if (run.state === "drafting" || run.state === "awaiting_plan") {
    const [stopped] = await db
      .update(researchRuns)
      .set({ state: "stopped", stopReason: "user", chargedCredits: 0, finishedAt: new Date() })
      .where(
        and(eq(researchRuns.id, runId), inArray(researchRuns.state, ["drafting", "awaiting_plan"])),
      )
      .returning();
    return stopped ?? ((await getRun(db, userId, runId)) as RunRow);
  }

  if (run.state === "queued" || run.state === "running") {
    const updated = (await mergeRunProgress(db, runId, { stopRequested: true })) ?? run;
    if (currentResearchConfig() && isStalledRun(toEngine(updated), Date.now())) {
      kickRun(runId, origin);
    }
    return updated;
  }
  return run;
}

/** The run view's poll. Restarts a run whose invocation died (the lease ran out). */
export async function getRunStatus(userId: string, runId: string, origin: string): Promise<RunRow> {
  const db = await getDb();
  const run = await getRun(db, userId, runId);
  if (!run) throw notFound("Run not found");
  if (currentResearchConfig() && isStalledRun(toEngine(run), Date.now())) kickRun(runId, origin);
  return run;
}

// ---------- Background loop ----------

/** Start (or continue) a run after the response, within this invocation. */
function kickRun(runId: string, origin: string) {
  runInBackground("research", () => runResearch(runId, origin));
}

/** The internal run endpoint's secret check (constant time). */
export function runSecretMatches(given: string | null): boolean {
  const secret = currentResearchConfig()?.runSecret;
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const runBody = z.object({ runId: z.string().min(1).max(100) });

/** Handle a hand-off call: continue the run in this new invocation. */
export function continueRun(runId: string, origin: string) {
  kickRun(runId, origin);
}

/** Re-invoke ourselves to continue in a fresh invocation (fresh time budget). */
async function handOff(runId: string, origin: string, config: ResearchConfig) {
  const vercelUrl = process.env.VERCEL_URL?.trim();
  const base = vercelUrl ? `https://${vercelUrl}` : origin;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.runSecret) headers["x-research-secret"] = config.runSecret;
  if (config.protectionBypass) headers["x-vercel-protection-bypass"] = config.protectionBypass;
  // Awaited inside waitUntil: a fire-and-forget fetch may never leave a
  // function that is about to end. The callee answers 202 straight away.
  const res = await fetch(`${base}/api/research/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ runId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status !== 202) throw new Error(`research hand-off got ${res.status}`);
}

export type RunLoopOptions = {
  /** The run's steps; defaults to those registered for its kind. */
  steps?: ResearchStep[];
  /** Time left in this invocation; defaults to the platform deadline minus now (tests force hand-offs). */
  timeLeftMs?: () => number;
  /** Replaces the HTTP hand-off (tests). */
  handOff?: (runId: string) => Promise<void>;
};

/**
 * Walk a run's steps until it finishes, stops, fails, or runs short of
 * time. Exits quietly when another invocation holds the run.
 */
export async function runResearch(
  runId: string,
  origin: string,
  options: RunLoopOptions = {},
): Promise<void> {
  const config = currentResearchConfig();
  if (!config) return;
  const deadline = getDeadline()?.getTime() ?? Date.now() + FALLBACK_RUN_MS;
  const timeLeftMs = options.timeLeftMs ?? (() => deadline - Date.now());
  const lease = randomUUID();
  const db = await getDb();

  let row = await claimRun(db, runId, lease, LEASE_MS);
  if (!row) return;

  const steps = options.steps ?? STEPS[row.kind];
  if (!steps?.length) {
    await endRun(row, lease, {
      state: "failed",
      stopReason: "error",
      error: "This kind of run isn't available yet.",
    });
    return;
  }

  for (let unit = 0; unit < 10_000; unit++) {
    const action = nextAction(steps, toEngine(row), {
      now: Date.now(),
      lease,
      timeLeftMs: timeLeftMs(),
    });

    if (action.type === "exit") return;

    if (action.type === "hand-off") {
      // Free the lease so the next invocation can claim it at once.
      if (!(await updateLeasedRun(db, runId, lease, { leaseUntil: null, runLease: null }))) return;
      try {
        if (options.handOff) await options.handOff(runId);
        else await handOff(runId, origin, config);
      } catch (err) {
        // The lease is free; the owner's next status poll restarts the run.
        console.error("[research] hand-off failed", err);
      }
      return;
    }

    if (action.type === "finish") {
      await endRun(row, lease, { state: action.state, stopReason: action.stopReason });
      return;
    }

    const step = steps.find((s) => s.name === action.step) as ResearchStep;
    let done: boolean;
    try {
      done = await step.work(stepContext(row, lease, config, (fresh) => (row = fresh)));
    } catch (err) {
      if (err instanceof LeaseLostError) return;
      if (err instanceof BudgetExceededError) {
        const stopped = await updateLeasedRun(db, runId, lease, {
          step: action.step,
          stopReason: "budget",
        });
        if (!stopped) return;
        row = stopped;
        continue;
      }
      console.error(`[research] step ${action.step} failed`, err);
      await endRun(row, lease, {
        state: "failed",
        stopReason: "error",
        // Page sources' messages are written for people ("rate limiting", "credits are used up").
        error:
          err instanceof RunStepError || err instanceof PageReadError
            ? err.message
            : GENERIC_RUN_ERROR,
      });
      return;
    }

    // Re-read: the Stop button writes progress while we hold the lease.
    const fresh = await getRunById(db, runId);
    if (!fresh || fresh.runLease !== lease) return;
    const patch: RunPatch = {
      step: done ? stepAfter(steps, action.step, isStopping(toEngine(fresh))) : action.step,
      leaseUntil: new Date(Date.now() + LEASE_MS),
    };
    const saved = await updateLeasedRun(db, runId, lease, patch);
    if (!saved) return;
    row = saved;
  }
}

function stepContext(
  row: RunRow,
  lease: string,
  config: ResearchConfig,
  onUpdate: (fresh: RunRow) => void,
): StepContext {
  let current = row;
  return {
    get run() {
      return current;
    },
    config,
    ensureBudget(worstCase) {
      const spent = {
        firecrawlCredits: current.firecrawlCredits,
        tokensIn: current.tokensIn,
        tokensOut: current.tokensOut,
      };
      if (!fitsBudget(spent, worstCase, current.budgetCredits, config.tokensPerCredit)) {
        throw new BudgetExceededError();
      }
    },
    async recordSpend(spend) {
      const updated = await addRunSpend(await getDb(), current.id, lease, spend);
      if (!updated) throw new LeaseLostError();
      current = updated;
      onUpdate(updated);
    },
    async saveProgress(patch) {
      const updated = await mergeRunProgress(await getDb(), current.id, patch);
      if (!updated) throw new LeaseLostError();
      current = updated;
      onUpdate(updated);
    },
  };
}

/** Move a run to a terminal state, free its lease, settle its credits and bump its topic. */
async function endRun(
  row: RunRow,
  lease: string,
  end: Pick<RunPatch, "state" | "stopReason" | "error">,
): Promise<void> {
  const db = await getDb();
  const ended = await updateLeasedRun(db, row.id, lease, {
    ...end,
    finishedAt: new Date(),
    leaseUntil: null,
    runLease: null,
  });
  if (!ended) return;
  try {
    await settleRun(ended);
  } catch (err) {
    // Unsettled runs keep `charged_credits` null; settling again is safe.
    console.error("[research] settling credits failed", err);
  }
  await touchTopic(db, ended.userId, ended.topicId);
  // Housekeeping with no cron: old cached model answers go when any run ends.
  await pruneModelCache(db).catch((err) => console.error("[research] cache prune failed", err));
}
