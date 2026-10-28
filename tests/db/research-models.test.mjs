import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { z } from "zod";
import { closeDb, skipWithoutDb } from "../support/db.mjs";

/**
 * Research model calls against the Postgres answer cache, with the provider
 * faked: the first call is checked against the budget, charged what the
 * provider reported and cached; the identical call is answered from the
 * cache with no call and no charge; a call that wouldn't fit is refused
 * before it is made; an off-schema answer is charged but not cached.
 */

describe("research model calls", { skip: skipWithoutDb }, () => {
  const saved = {};
  let models;
  let runs;
  let cacheDb;
  let db;
  let generated;
  let checks;
  let spent;
  let refuse;
  let answer;

  const meter = {
    ensureBudget(worst) {
      checks.push(worst);
      if (refuse) throw new runs.BudgetExceededError();
    },
    async recordSpend(spend) {
      spent.tokensIn += spend.tokensIn ?? 0;
      spent.tokensOut += spend.tokensOut ?? 0;
    },
  };

  const fakeGenerate = async (_model, call) => {
    generated.push(call);
    return { output: answer, inputTokens: 1200, outputTokens: 80, modelId: "fake/model" };
  };

  const schema = z.object({ ideas: z.array(z.string()) });
  /** A prompt unique to this test run, so earlier runs' cache rows never hit. */
  const call = (prompt) => ({
    tier: "worker",
    schema,
    promptVersion: "test-v1",
    instructions: "List the ideas.",
    prompt: `${prompt} ${process.pid}-${Date.now()}`,
    maxOutputTokens: 300,
  });

  before(async () => {
    for (const k of ["OPENROUTER_API_KEY", "AI_MODELS", "RESEARCH_WRITER_MODELS"])
      saved[k] = process.env[k];
    process.env.OPENROUTER_API_KEY = "or-test";
    delete process.env.AI_MODELS;
    delete process.env.RESEARCH_WRITER_MODELS;
    db = await (await import("@/lib/db.server")).getDb();
    models = await import("@/server/services/research/models.ts");
    runs = await import("@/server/services/research/runs.ts");
    cacheDb = await import("@/lib/research-model-cache-db.server.ts");
  });

  beforeEach(() => {
    generated = [];
    checks = [];
    spent = { tokensIn: 0, tokensOut: 0 };
    refuse = false;
    answer = { ideas: ["faster editing"] };
  });

  after(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await closeDb();
  });

  it("checks the budget, charges what the provider reported, and caches the answer", async () => {
    const c = call("first");
    assert.deepEqual(await models.callModel(meter, c, fakeGenerate), { ideas: ["faster editing"] });
    assert.equal(generated.length, 1);
    assert.equal(checks.length, 1);
    assert.equal(checks[0].tokensOut, 300);
    assert.ok(checks[0].tokensIn >= Math.ceil(c.prompt.length / 3));
    assert.deepEqual(spent, { tokensIn: 1200, tokensOut: 80 });

    const again = await models.callModel(meter, c, fakeGenerate);
    assert.deepEqual(again, { ideas: ["faster editing"] });
    assert.equal(generated.length, 1, "the repeat was answered from the cache");
    assert.equal(checks.length, 1, "a cache hit needs no budget check");
    assert.deepEqual(spent, { tokensIn: 1200, tokensOut: 80 }, "and costs nothing");
  });

  it("refuses a call that wouldn't fit before making it", async () => {
    refuse = true;
    await assert.rejects(
      models.callModel(meter, call("refused"), fakeGenerate),
      runs.BudgetExceededError,
    );
    assert.equal(generated.length, 0);
    assert.deepEqual(spent, { tokensIn: 0, tokensOut: 0 });
  });

  it("charges an off-schema answer, retries it once warmer, and doesn't cache it", async () => {
    answer = { ideas: "not a list" };
    const c = call("bad");
    await assert.rejects(models.callModel(meter, c, fakeGenerate), runs.RunStepError);
    assert.equal(generated.length, 2, "one retry");
    assert.ok(generated[1].temperature > generated[0].temperature, "the retry runs warmer");
    assert.deepEqual(spent, { tokensIn: 2400, tokensOut: 160 }, "both calls charged");
    answer = { ideas: ["ok now"] };
    assert.deepEqual(await models.callModel(meter, c, fakeGenerate), { ideas: ["ok now"] });
    assert.equal(generated.length, 3, "the bad answer wasn't served from the cache");
  });

  it("uses the retry's answer when the first one is unusable", async () => {
    let calls = 0;
    const flaky = async (model, c) => {
      calls++;
      return fakeGenerate(model, c).then((r) =>
        calls === 1 ? { ...r, output: null } : { ...r, output: { ideas: ["second try"] } },
      );
    };
    assert.deepEqual(await models.callModel(meter, call("flaky"), flaky), {
      ideas: ["second try"],
    });
    assert.equal(calls, 2);
  });

  it("turns a provider failure into a message for the user", async () => {
    const failing = async () => {
      throw Object.assign(new Error("rate limited"), { statusCode: 429 });
    };
    await assert.rejects(models.callModel(meter, call("fails"), failing), (err) => {
      assert.ok(err instanceof runs.RunStepError);
      assert.match(err.message, /busy/);
      return true;
    });
  });

  it("prunes answers older than 30 days", async () => {
    const { researchModelCache } = await import("@/lib/schema.ts");
    const { eq } = await import("drizzle-orm");
    const key = `old-${process.pid}-${Date.now()}`;
    await cacheDb.storeAnswer(db, { key, model: "m", output: {}, tokensIn: 0, tokensOut: 0 });
    await db
      .update(researchModelCache)
      .set({ createdAt: new Date(Date.now() - 31 * 86_400_000) })
      .where(eq(researchModelCache.key, key));
    assert.ok((await cacheDb.pruneModelCache(db)) >= 1);
    assert.equal(await cacheDb.cachedAnswer(db, key), null);
  });
});
