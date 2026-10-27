import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb, skipWithoutDb, testUser } from "../support/db.mjs";

/**
 * Validate (ticket 15) against Postgres, with Firecrawl and the model faked:
 * a plan always includes the required counter-evidence searches; a run writes
 * a report whose claims are checked against the topic (unknown ids are
 * unsupported); the counter-evidence section is never empty; reports are
 * owner-scoped.
 */

const ORIGIN = "http://localhost:8080";
const PAGE_URL = "https://forum.example.com/t/editing";
const PAGE =
  "Podcast editing takes hours every single week and it is so frustrating.\n\nThe current tools are good enough for most people.";
const QUOTE = "Podcast editing takes hours every single week and it is so frustrating.";

describe("research validate", { skip: skipWithoutDb }, () => {
  const saved = {};
  let owner;
  let stranger;
  let db;
  let eq;
  let schema;
  let rdb;
  let ledger;
  let runsDb;
  let runs;
  let product;
  let validate;
  let ideasDb;

  const fakeSearch = async () => ({
    credits: 2,
    results: [
      {
        url: PAGE_URL,
        title: "Editing is so frustrating",
        description: "I hate spending hours",
      },
    ],
  });
  const calls = {
    search: fakeSearch,
    hnSearch: async () => (await fakeSearch()).results,
    scrape: async () => ({
      markdown: PAGE,
      title: "Forum",
      publishedAt: new Date("2026-01-01"),
      credits: 1,
    }),
  };

  const fakeGenerate = async (_model, call) => {
    if (call.instructions.startsWith("You plan web searches that test")) {
      return {
        output: {
          queries: [
            { query: "podcast editing frustrating", site: "web", intent: "pain" },
            { query: "editing good enough", site: "web", intent: "pain" },
          ],
        },
        inputTokens: 200,
        outputTokens: 80,
        modelId: "fake",
      };
    }
    if (call.instructions.startsWith("You pull out")) {
      const label = call.prompt.match(/source="(S\d+)"/)?.[1] ?? "S1";
      return {
        output: {
          quotes: [{ source: label, quote: QUOTE, kind: "pain", sentiment: -2, strong: true }],
        },
        inputTokens: 400,
        outputTokens: 40,
        modelId: "fake",
      };
    }
    const labels = [...call.prompt.matchAll(/^E(\d+)/gm)].map((m) => `E${m[1]}`);
    const first = labels[0] ?? "E1";
    return {
      output: {
        sections: [
          { id: "problem", claims: [{ text: "Editing takes hours.", evidence: [first] }] },
          { id: "how_bad", claims: [{ text: "Invented intensity.", evidence: ["E999"] }] },
          { id: "solutions", claims: [] },
          { id: "pays", claims: [] },
          { id: "counter", claims: [] },
          { id: "verdict", claims: [{ text: "Check whether people would pay.", evidence: [] }] },
        ],
      },
      inputTokens: 600,
      outputTokens: 120,
      modelId: "fake",
    };
  };

  async function drive(runId, steps) {
    for (let i = 0; i < 40; i++) {
      let checks = 0;
      await runs.runResearch(runId, ORIGIN, {
        steps,
        timeLeftMs: () => (checks++ < 1 ? 1e9 : 0),
        handOff: async () => {},
      });
      const row = await runsDb.getRunById(db, runId);
      if (["done", "stopped", "failed"].includes(row.state)) return row;
    }
    throw new Error("run never ended");
  }

  before(async () => {
    for (const k of ["FIRECRAWL_API_KEY", "OPENROUTER_API_KEY", "AI_MODELS", "VERCEL"]) {
      saved[k] = process.env[k];
    }
    process.env.FIRECRAWL_API_KEY = "fc-test";
    process.env.OPENROUTER_API_KEY = "or-test";
    delete process.env.AI_MODELS;
    delete process.env.VERCEL;
    ({ eq } = await import("drizzle-orm"));
    schema = await import("@/lib/schema.ts");
    db = await (await import("@/lib/db.server")).getDb();
    rdb = await import("@/lib/research-db.server.ts");
    ledger = await import("@/lib/research-credits-db.server.ts");
    runsDb = await import("@/lib/research-runs-db.server.ts");
    runs = await import("@/server/services/research/runs.ts");
    product = await import("@/server/services/research/product.ts");
    validate = await import("@/server/services/research/validate.ts");
    ideasDb = await import("@/lib/research-ideas-db.server.ts");
    owner = await testUser();
    stranger = await testUser();
  });

  after(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await owner?.cleanup();
    await stranger?.cleanup();
    await closeDb();
  });

  async function seedIdea() {
    const topic = await rdb.createTopic(db, owner.id, `podcasting ${process.pid}-${Date.now()}`);
    const ideaId = await ideasDb.createIdea(db, {
      userId: owner.id,
      topicId: topic.id,
      title: "Editing remote interviews takes hours",
      summary: "People spend evenings cutting tape.",
      runId: "seed",
    });
    await ledger.grantResearchCredits(db, owner.id, 200, "test");
    return { topic, ideaId };
  }

  it("drafts a Validate plan that includes the required counter-evidence searches", async () => {
    const { topic, ideaId } = await seedIdea();
    const { run } = await runs.draftRun(
      owner.id,
      {
        topicId: topic.id,
        kind: "validate",
        depth: "quick",
        input: { seed: "Editing remote interviews takes hours", ideaId },
      },
      validate.validateDrafter({ generate: fakeGenerate }),
    );
    assert.equal(run.kind, "validate");
    assert.equal(run.input.ideaId, ideaId);
    const counters = run.plan.filter((q) => q.counter);
    assert.equal(counters.length, 5);
    assert.ok(run.plan.some((q) => /good enough/.test(q.query)));
    assert.ok(run.plan.some((q) => /stopped using/.test(q.query)));
    assert.ok(run.plan.some((q) => /not worth it/.test(q.query)));
    assert.ok(run.plan.some((q) => /shut down/.test(q.query)));
    assert.ok(run.plan.some((q) => /market too small/.test(q.query)));
  });

  it("writes a checked report: real citations kept, unknown ids unsupported, counter never empty", async () => {
    const { topic, ideaId } = await seedIdea();
    const { run } = await runs.draftRun(
      owner.id,
      {
        topicId: topic.id,
        kind: "validate",
        depth: "quick",
        input: { seed: "Editing remote interviews takes hours", ideaId },
      },
      validate.validateDrafter({ generate: fakeGenerate }),
    );
    await ledger.reserveRunCredits(db, owner.id, run.id, 45, "start");
    await db.update(schema.researchRuns).set({ state: "queued" }).where(eq(schema.researchRuns.id, run.id));

    const finished = await drive(
      run.id,
      validate.validateSteps({ generate: fakeGenerate, calls }),
    );
    assert.equal(finished.state, "done");
    assert.equal(finished.progress.reported, true);

    const reports = await product.listResearchReports(owner.id, topic.id);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].kind, "validate");
    assert.equal(reports[0].ideaId, ideaId);

    const report = await product.researchReport(owner.id, reports[0].id);
    const byId = Object.fromEntries(report.sections.map((s) => [s.id, s]));
    assert.deepEqual(
      report.sections.map((s) => s.id),
      ["problem", "how_bad", "solutions", "pays", "counter", "verdict"],
    );
    assert.equal(byId.problem.claims[0].unsupported, false);
    assert.equal(byId.problem.claims[0].evidence.length, 1);
    assert.equal(byId.problem.claims[0].evidence[0].quote, QUOTE);
    assert.equal(byId.how_bad.claims[0].unsupported, true);
    assert.equal(byId.how_bad.claims[0].evidence.length, 0);
    assert.equal(byId.counter.claims.length, 1);
    assert.match(byId.counter.claims[0].text, /Nothing turned up/);

    await assert.rejects(product.researchReport(stranger.id, report.id), (err) => err.status === 404);
    await assert.rejects(
      product.listResearchReports(stranger.id, topic.id),
      (err) => err.status === 404,
    );
  });
});
