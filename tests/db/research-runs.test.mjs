import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { closeDb, skipWithoutDb, testUser } from "../support/db.mjs";

/**
 * The research run loop against Postgres, with fake steps standing in for
 * Discover: a resumed run never repeats a paid call, a budget or user stop
 * keeps what was gathered and settles the rest, a failure ends the run and
 * settles, and an invocation never works a run another one holds.
 */

const ORIGIN = "http://localhost:8080";

describe("research run loop", { skip: skipWithoutDb }, () => {
  const savedEnv = {};
  let user;
  let db;
  let rdb;
  let ledger;
  let runsDb;
  let runs;
  let topic;
  /** Every paid call the fake steps made, by unit. */
  let paid;

  /** A fake "read pages" step: 3 units, each spending 5 Firecrawl credits. */
  const collect = {
    name: "collect",
    async work(ctx) {
      const done = ctx.run.progress.read ?? 0;
      ctx.ensureBudget({ firecrawlCredits: 5 });
      paid.push(`${ctx.run.id}:collect:${done}`);
      await ctx.recordSpend({ firecrawlCredits: 5, tokensIn: 1_000 });
      await ctx.saveProgress({ read: done + 1 });
      return done + 1 >= 3;
    },
  };
  /** A fake scoring step: free, and runs even when the run is stopping. */
  const score = {
    name: "score",
    final: true,
    async work(ctx) {
      await ctx.saveProgress({ ideasNew: ctx.run.progress.read ?? 0 });
      return true;
    },
  };
  const steps = [collect, score];

  /** A run that has reserved `budget` and is queued, as startRun leaves it. */
  async function queuedRun(budget) {
    await ledger.grantResearchCredits(db, user.id, budget, "test");
    const run = await rdb.createRun(db, user.id, topic.id, {
      kind: "discover",
      depth: "quick",
      input: { seed: "x" },
    });
    await ledger.reserveRunCredits(db, user.id, run.id, budget, "start");
    const { eq } = await import("drizzle-orm");
    const { researchRuns } = await import("@/lib/schema.ts");
    await db.update(researchRuns).set({ state: "queued" }).where(eq(researchRuns.id, run.id));
    return run;
  }

  /** Let exactly `units` units run in this invocation, then hand off. */
  const allowUnits = (units) => {
    let checks = 0;
    return () => (checks++ < units ? 1e9 : 0);
  };

  /** Run invocation after invocation (one unit each) until the run ends. */
  async function runToEnd(runId, unitsPerInvocation = 1) {
    let handOffs = 0;
    for (let i = 0; i < 50; i++) {
      await runs.runResearch(runId, ORIGIN, {
        steps,
        timeLeftMs: allowUnits(unitsPerInvocation),
        handOff: async () => {
          handOffs++;
        },
      });
      const row = await runsDb.getRunById(db, runId);
      if (["done", "stopped", "failed"].includes(row.state)) return { row, handOffs };
    }
    throw new Error("run never ended");
  }

  before(async () => {
    for (const key of ["FIRECRAWL_API_KEY", "OPENROUTER_API_KEY", "AI_MODELS", "VERCEL"]) {
      savedEnv[key] = process.env[key];
    }
    process.env.FIRECRAWL_API_KEY = "fc-test";
    process.env.OPENROUTER_API_KEY = "or-test";
    delete process.env.AI_MODELS;
    delete process.env.VERCEL;

    db = await (await import("@/lib/db.server")).getDb();
    rdb = await import("@/lib/research-db.server.ts");
    ledger = await import("@/lib/research-credits-db.server.ts");
    runsDb = await import("@/lib/research-runs-db.server.ts");
    runs = await import("@/server/services/research/runs.ts");
    // A stalled run restarted in the background (Stop, a status poll) uses the
    // registered steps, as it will with Discover's.
    runs.registerRunSteps("discover", steps);
    user = await testUser();
    topic = await rdb.createTopic(db, user.id, "runs");
  });

  beforeEach(() => {
    paid = [];
  });

  after(async () => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await user?.cleanup();
    await closeDb();
  });

  it("a run handed off after every unit finishes without repeating a paid call", async () => {
    const run = await queuedRun(30);
    const balanceBefore = await ledger.researchCreditBalance(db, user.id);
    const { row, handOffs } = await runToEnd(run.id);

    assert.equal(row.state, "done");
    assert.equal(row.stopReason, null);
    // After each collect unit; finishing after the final step needs no time.
    assert.equal(handOffs, 3);
    assert.deepEqual(
      paid,
      [0, 1, 2].map((n) => `${run.id}:collect:${n}`),
    );
    assert.equal(row.progress.ideasNew, 3);
    assert.equal(row.leaseUntil, null);
    assert.ok(row.finishedAt);
    // 15 Firecrawl credits + ceil(3,000 tokens / 20,000) = 16; the other 14 return.
    assert.equal(row.chargedCredits, 16);
    assert.equal(await ledger.researchCreditBalance(db, user.id), balanceBefore + 14);
  });

  it("a run at its budget stops cleanly, scores what it has and releases the rest", async () => {
    const run = await queuedRun(12);
    const balanceBefore = await ledger.researchCreditBalance(db, user.id);
    const { row } = await runToEnd(run.id, 100);

    assert.equal(row.state, "stopped");
    assert.equal(row.stopReason, "budget");
    assert.equal(paid.length, 2, "the third unit would have gone over, so it never ran");
    assert.equal(row.progress.ideasNew, 2, "the final step still scored what was gathered");
    assert.equal(row.chargedCredits, 11);
    assert.equal(await ledger.researchCreditBalance(db, user.id), balanceBefore + 1);
  });

  it("Stop skips to the final steps and ends the run stopped by the user", async () => {
    const run = await queuedRun(30);
    await runs.runResearch(run.id, ORIGIN, {
      steps,
      timeLeftMs: allowUnits(1),
      handOff: async () => {},
    });
    await runs.requestStop(user.id, run.id, ORIGIN);
    const { row } = await runToEnd(run.id, 100);

    assert.equal(row.state, "stopped");
    assert.equal(row.stopReason, "user");
    assert.equal(paid.length, 1);
    assert.equal(row.progress.ideasNew, 1);
  });

  it("a failing step ends the run with its message and settles", async () => {
    const run = await queuedRun(30);
    const balanceBefore = await ledger.researchCreditBalance(db, user.id);
    const broken = {
      name: "broken",
      async work(ctx) {
        await ctx.recordSpend({ firecrawlCredits: 2 });
        throw new runs.RunStepError("Firecrawl credits are used up.");
      },
    };
    await runs.runResearch(run.id, ORIGIN, { steps: [broken, score] });
    const row = await runsDb.getRunById(db, run.id);

    assert.equal(row.state, "failed");
    assert.equal(row.error, "Firecrawl credits are used up.");
    assert.equal(row.chargedCredits, 2);
    assert.equal(await ledger.researchCreditBalance(db, user.id), balanceBefore + 28);
  });

  it("never works a run another invocation holds", async () => {
    const run = await queuedRun(30);
    assert.ok(await runsDb.claimRun(db, run.id, "someone-else", 60_000));
    await runs.runResearch(run.id, ORIGIN, { steps });
    assert.equal(paid.length, 0);
    assert.equal((await runsDb.getRunById(db, run.id)).runLease, "someone-else");
  });

  it("starting needs a drafted run and enough credits; stopping a draft just ends it", async () => {
    const drafter = async () => ({ plan: [], tokensIn: 500, tokensOut: 100 });
    const { run } = await runs.draftRun(
      user.id,
      { topicId: topic.id, kind: "discover", input: { seed: "x" }, depth: "deep" },
      drafter,
    );
    assert.equal(run.state, "awaiting_plan");
    assert.equal(run.tokensIn, 500);

    const balance = await ledger.researchCreditBalance(db, user.id);
    if (balance > 0) await ledger.grantResearchCredits(db, user.id, -balance, "drain");
    await assert.rejects(
      runs.startRun(user.id, run.id, { plan: [], depth: "deep" }, ORIGIN),
      (err) => err.status === 402,
    );
    assert.equal((await runsDb.getRunById(db, run.id)).state, "awaiting_plan");

    const stopped = await runs.requestStop(user.id, run.id, ORIGIN);
    assert.equal(stopped.state, "stopped");
    assert.equal(stopped.chargedCredits, 0);
    await assert.rejects(
      runs.startRun(user.id, run.id, { plan: [], depth: "deep" }, ORIGIN),
      (err) => err.status === 409,
    );
  });

  it("only the owner can see or stop a run", async () => {
    const other = await testUser();
    try {
      const run = await queuedRun(30);
      await assert.rejects(runs.getRunStatus(other.id, run.id, ORIGIN), (e) => e.status === 404);
      await assert.rejects(runs.requestStop(other.id, run.id, ORIGIN), (e) => e.status === 404);
    } finally {
      await other.cleanup();
    }
  });
});
