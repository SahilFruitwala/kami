import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb, skipWithoutDb, testUser } from "../support/db.mjs";

/**
 * Ask a question (ticket 16) against Postgres, with Firecrawl and the model
 * faked: a question drafts a plan, the run writes a cited report with no
 * fixed sections, unknown ids are unsupported, and reports are owner-scoped.
 */

const ORIGIN = "http://localhost:8080";
const PAGE_URL = "https://forum.example.com/t/invoicing";
const PAGE =
  "Freelance designers still send invoices in Word because the tools cost too much.\n\nI would pay $20 a month if it just worked.";
const QUOTE = "Freelance designers still send invoices in Word because the tools cost too much.";

describe("research question", { skip: skipWithoutDb }, () => {
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
  let question;

  const fakeSearch = async () => ({
    credits: 2,
    results: [{ url: PAGE_URL, title: "Invoicing is expensive", description: "Word invoices" }],
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
    if (call.instructions.startsWith("You plan web searches that find what real people say that would answer")) {
      return {
        output: {
          queries: [{ query: "freelance designers invoicing too expensive", site: "web", intent: "pain" }],
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
          {
            title: "What people say",
            claims: [{ text: "Designers still use Word.", evidence: [first] }],
          },
          {
            title: "Guesses",
            claims: [{ text: "Everyone would pay $99.", evidence: ["E999"] }],
          },
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
    question = await import("@/server/services/research/question.ts");
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

  it("drafts from a question and writes a cited report with no fixed sections", async () => {
    const topic = await rdb.createTopic(db, owner.id, `invoicing ${process.pid}-${Date.now()}`);
    await ledger.grantResearchCredits(db, owner.id, 200, "test");
    const asked = "Do freelance designers pay for invoicing tools?";
    const { run } = await runs.draftRun(
      owner.id,
      {
        topicId: topic.id,
        kind: "question",
        depth: "quick",
        input: { seed: asked, question: asked },
      },
      question.questionDrafter({ generate: fakeGenerate }),
    );
    assert.equal(run.kind, "question");
    assert.equal(run.input.question, asked);
    assert.ok(run.plan.some((q) => q.checked));

    await ledger.reserveRunCredits(db, owner.id, run.id, 45, "start");
    await db.update(schema.researchRuns).set({ state: "queued" }).where(eq(schema.researchRuns.id, run.id));

    const finished = await drive(run.id, question.questionSteps({ generate: fakeGenerate, calls }));
    assert.equal(finished.state, "done");
    assert.equal(finished.progress.reported, true);

    const reports = await product.listResearchReports(owner.id, topic.id);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].kind, "question");
    assert.equal(reports[0].question, asked);

    const report = await product.researchReport(owner.id, reports[0].id);
    assert.deepEqual(
      report.sections.map((s) => s.title),
      ["What people say", "Guesses"],
    );
    assert.equal(report.sections[0].claims[0].unsupported, false);
    assert.equal(report.sections[0].claims[0].evidence[0].quote, QUOTE);
    assert.equal(report.sections[1].claims[0].unsupported, true);

    await assert.rejects(product.researchReport(stranger.id, report.id), (err) => err.status === 404);
  });
});
