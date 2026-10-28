import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb, skipWithoutDb, testUser } from "../support/db.mjs";

/**
 * Discover's fetch and extract steps against Postgres, with Firecrawl and the
 * model faked: unreadable pages are skipped, not fatal; every quote is
 * checked against its stored page, so a made-up quote or a wrong source
 * label is dropped and a near-miss is stored in the page's own words;
 * running extraction again stores nothing twice.
 */

const ORIGIN = "http://localhost:8080";

const PAGES = {
  "https://a.example.com/thread": [
    "[Home](/)",
    "[Forum](/f)",
    "[Rules](/r)",
    "",
    "I spend **four hours** editing every single episode and it is driving me mad.",
    "",
    "Someone said: “Descript keeps crashing on long recordings, so I switched to Audacity.”",
  ].join("\n"),
  "https://c.example.com/review":
    "The price went up to $30 a month, which is too expensive for a hobby podcast.",
};

describe("discover: fetch, extract, verify", { skip: skipWithoutDb }, () => {
  const saved = {};
  let user;
  let db;
  let rdb;
  let ledger;
  let runsDb;
  let runs;
  let evidence;
  let firecrawl;
  let topic;
  const scraped = [];
  const prompts = [];

  const fakeScrape = async (url) => {
    scraped.push(url);
    if (!PAGES[url]) throw new firecrawl.FirecrawlError("Firecrawl could not read that page.", 502);
    return { markdown: PAGES[url], title: "Page", publishedAt: new Date("2026-01-01"), credits: 1 };
  };

  /** Answers with one exact, one near-miss, one made-up and one mislabelled quote. */
  const fakeGenerate = async (_model, call) => {
    prompts.push(call.prompt);
    const label = (site) => call.prompt.match(new RegExp(`source="(S\\d+)" site="${site}"`))?.[1];
    const a = label("a.example.com");
    const c = label("c.example.com");
    return {
      output: {
        quotes: [
          {
            source: a,
            quote: "Descript keeps crashing on long recordings, so I switched to Audacity.",
            kind: "competitor",
            sentiment: -2,
            strong: true,
            pays: false,
            names: ["Descript", "Audacity", "descript"],
            author: "u/PodGuy",
            date: "2025-12-01",
          },
          {
            source: a,
            quote: "I spend four hours editing every single episode and it is driving me crazy.",
            kind: "pain",
            sentiment: -5,
            strong: true,
            pays: false,
            names: [],
          },
          {
            source: a,
            quote: "Nobody here would ever pay for an editing tool, ever.",
            kind: "opinion",
          },
          {
            source: "S9",
            quote: "The price went up to $30 a month, which is too expensive.",
            kind: "price",
          },
          {
            source: c,
            quote: "The price went up to $30 a month, which is too expensive for a hobby podcast.",
            kind: "price",
            sentiment: -1,
            strong: false,
            pays: true,
            names: [],
          },
        ],
      },
      inputTokens: 2_000,
      outputTokens: 400,
      modelId: "fake",
    };
  };

  async function runSteps(runId, steps) {
    for (let i = 0; i < 30; i++) {
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
    for (const k of ["FIRECRAWL_API_KEY", "OPENROUTER_API_KEY", "AI_MODELS", "VERCEL"])
      saved[k] = process.env[k];
    process.env.FIRECRAWL_API_KEY = "fc-test";
    process.env.OPENROUTER_API_KEY = "or-test";
    delete process.env.AI_MODELS;
    delete process.env.VERCEL;
    db = await (await import("@/lib/db.server")).getDb();
    rdb = await import("@/lib/research-db.server.ts");
    ledger = await import("@/lib/research-credits-db.server.ts");
    runsDb = await import("@/lib/research-runs-db.server.ts");
    runs = await import("@/server/services/research/runs.ts");
    evidence = await import("@/server/services/research/evidence.ts");
    firecrawl = await import("@/lib/firecrawl.server.ts");
    user = await testUser();
    topic = await rdb.createTopic(db, user.id, "evidence");
  });

  after(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await user?.cleanup();
    await closeDb();
  });

  it("reads the picks, keeps only quotes found on their page, and never stores one twice", async () => {
    // Seed is unique per test run so the model cache never answers from an earlier run.
    const seed = `podcast editing ${process.pid}-${Date.now()}`;
    const run = await rdb.createRun(db, user.id, topic.id, {
      kind: "discover",
      depth: "quick",
      input: { seed },
    });
    await ledger.grantResearchCredits(db, user.id, 30, "test");
    await ledger.reserveRunCredits(db, user.id, run.id, 30, "start");
    const { eq } = await import("drizzle-orm");
    const { researchRuns } = await import("@/lib/schema.ts");
    await db
      .update(researchRuns)
      .set({
        state: "queued",
        progress: {
          toRead: [
            "https://a.example.com/thread",
            "https://b.example.com/broken",
            "https://c.example.com/review",
          ],
        },
      })
      .where(eq(researchRuns.id, run.id));

    const deps = { calls: { scrape: fakeScrape }, generate: fakeGenerate };
    const steps = [evidence.fetchStep(deps), evidence.extractStep(deps)];
    const row = await runSteps(run.id, steps);

    assert.equal(row.state, "done");
    assert.deepEqual(scraped, [
      "https://a.example.com/thread",
      "https://b.example.com/broken",
      "https://c.example.com/review",
    ]);
    assert.equal(row.progress.read, 2);
    assert.deepEqual(row.progress.skippedUrls, ["https://b.example.com/broken"]);
    assert.equal(prompts.length, 1, "both pages fit one extraction call");
    assert.ok(!prompts[0].includes("[Home]"), "the stored page was trimmed");
    assert.equal(row.progress.quotes, 3);
    assert.equal(row.progress.dropped, 2);

    const stored = await rdb.runEvidence(db, run.id);
    const byKind = Object.fromEntries(stored.map((e) => [e.kind, e]));
    assert.equal(byKind.competitor.match, "exact");
    assert.deepEqual(byKind.competitor.names, ["Descript", "Audacity"]);
    assert.ok(byKind.competitor.authorKey && !byKind.competitor.authorKey.includes("PodGuy"));
    assert.equal(byKind.competitor.postedAt.toISOString(), "2025-12-01T00:00:00.000Z");
    assert.equal(byKind.pain.match, "close");
    assert.equal(
      byKind.pain.quote,
      "I spend four hours editing every single episode and it is driving me mad.",
    );
    assert.equal(byKind.pain.sentiment, -2, "clamped");
    assert.equal(byKind.pain.postedAt.toISOString(), "2026-01-01T00:00:00.000Z", "page date");
    assert.equal(byKind.price.pays, true);
    assert.ok(!stored.some((e) => e.quote.includes("Nobody here")));

    // Extract again from scratch: the cache answers and nothing new is stored.
    const { mergeRunProgress } = runsDb;
    await mergeRunProgress(db, run.id, { extractBatches: 0 });
    await db
      .update(researchRuns)
      .set({ state: "queued", step: "extract", chargedCredits: null, finishedAt: null })
      .where(eq(researchRuns.id, run.id));
    await runSteps(run.id, steps);
    assert.equal((await rdb.runEvidence(db, run.id)).length, 3);
    assert.equal(prompts.length, 1, "answered from the model cache");
  });

  it("stops the run when Firecrawl is out of credits instead of skipping every page", async () => {
    const run = await rdb.createRun(db, user.id, topic.id, {
      kind: "discover",
      depth: "quick",
      input: { seed: "x" },
    });
    await ledger.grantResearchCredits(db, user.id, 30, "test");
    await ledger.reserveRunCredits(db, user.id, run.id, 30, "start");
    const { eq } = await import("drizzle-orm");
    const { researchRuns } = await import("@/lib/schema.ts");
    await db
      .update(researchRuns)
      .set({
        state: "queued",
        progress: { toRead: ["https://z.example.com/1", "https://z.example.com/2"] },
      })
      .where(eq(researchRuns.id, run.id));
    const broke = async () => {
      throw new firecrawl.FirecrawlError("Firecrawl credits are used up.", 502);
    };
    const row = await runSteps(run.id, [evidence.fetchStep({ calls: { scrape: broke } })]);
    assert.equal(row.state, "failed");
    assert.equal(row.error, "Firecrawl credits are used up.");
  });

  it("reads the best spare pick in place of one it had to skip", async () => {
    const run = await rdb.createRun(db, user.id, topic.id, {
      kind: "discover",
      depth: "quick",
      input: { seed: "x" },
    });
    await ledger.grantResearchCredits(db, user.id, 30, "test");
    await ledger.reserveRunCredits(db, user.id, run.id, 30, "start");
    const { eq } = await import("drizzle-orm");
    const { researchRuns } = await import("@/lib/schema.ts");
    await db
      .update(researchRuns)
      .set({
        state: "queued",
        progress: {
          toRead: ["https://s.example.com/ok", "https://s.example.com/broken"],
          spares: ["https://s.example.com/spare-1", "https://s.example.com/spare-2"],
        },
      })
      .where(eq(researchRuns.id, run.id));
    const read = [];
    const scrape = async (url) => {
      read.push(url);
      if (url.endsWith("/broken")) {
        throw new firecrawl.FirecrawlError("Firecrawl could not read that page.", 502);
      }
      return { markdown: `Text of ${url}`, title: "Page", publishedAt: null, credits: 1 };
    };
    const row = await runSteps(run.id, [evidence.fetchStep({ calls: { scrape } })]);
    assert.equal(row.state, "done");
    assert.deepEqual(read, [
      "https://s.example.com/ok",
      "https://s.example.com/broken",
      "https://s.example.com/spare-1",
    ]);
    assert.deepEqual(row.progress.toRead, [
      "https://s.example.com/ok",
      "https://s.example.com/broken",
      "https://s.example.com/spare-1",
    ]);
    assert.deepEqual(row.progress.spares, ["https://s.example.com/spare-2"]);
    assert.equal(row.progress.read, 2);
    assert.equal(row.progress.failed, 1);
  });
});
