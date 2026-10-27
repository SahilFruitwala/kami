import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb, skipWithoutDb, testUser } from "../support/db.mjs";

/**
 * Explore players (ticket 17) against Postgres: names in evidence become
 * Players without duplicates (name_key); an Explore run fills fields from
 * fetched homepage and pricing pages only; lists are owner-scoped.
 */

const ORIGIN = "http://localhost:8080";
const HOME = "https://www.descript.com/";
const FORUM = "https://forum.example.com/t/descript";
const PAGE =
  "Descript is so frustrating for long interviews and I switched because of it.\n\nThe current tools are fine otherwise.";
const QUOTE = "Descript is so frustrating for long interviews and I switched because of it.";
const HOME_MD =
  "Descript is an AI video editor for podcasters.\nPricing: Creator $24/month. There is a free plan.";

describe("research explore", { skip: skipWithoutDb }, () => {
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
  let explore;
  let playersDb;

  const fakeSearch = async () => ({
    credits: 2,
    results: [
      { url: FORUM, title: "Descript is so frustrating", description: "I switched" },
      { url: HOME, title: "Descript — AI video editor", description: "Edit podcasts" },
    ],
  });
  const calls = {
    search: fakeSearch,
    hnSearch: async () => (await fakeSearch()).results,
    scrape: async (url) => ({
      markdown: url.includes("descript.com") ? HOME_MD : PAGE,
      title: url.includes("descript.com") ? "Descript" : "Forum",
      publishedAt: new Date("2026-01-01"),
      credits: 1,
    }),
  };

  const fakeGenerate = async (_model, call) => {
    if (call.instructions.startsWith("You plan web searches that find the products")) {
      return {
        output: {
          queries: [{ query: "best podcast editing tools", site: "web", intent: "alternatives" }],
        },
        inputTokens: 200,
        outputTokens: 80,
        modelId: "fake",
      };
    }
    if (call.instructions.startsWith("You choose which search results")) {
      const lines = call.prompt.split("\n").filter((l) => /^\d+\. /.test(l));
      return {
        output: { read: lines.map((l) => Number(l.split(".")[0])) },
        inputTokens: 100,
        outputTokens: 10,
        modelId: "fake",
      };
    }
    if (call.instructions.startsWith("You pull out")) {
      const label = call.prompt.match(/source="(S\d+)"/)?.[1] ?? "S1";
      const fromHome = call.prompt.includes("Descript is an AI video editor");
      return {
        output: {
          quotes: fromHome
            ? []
            : [
                {
                  source: label,
                  quote: QUOTE,
                  kind: "pain",
                  sentiment: -2,
                  strong: true,
                  names: ["Descript"],
                },
              ],
        },
        inputTokens: 400,
        outputTokens: 40,
        modelId: "fake",
      };
    }
    if (call.instructions.startsWith("You fill in a product")) {
      return {
        output: {
          one_liner: "AI video editor for podcasters",
          category: "video editor",
          audience: "podcasters",
          plans: [{ name: "Creator", price: "$24/month" }],
          free_plan: true,
        },
        inputTokens: 300,
        outputTokens: 40,
        modelId: "fake",
      };
    }
    throw new Error(`unexpected model call: ${call.instructions.slice(0, 80)}`);
  };

  async function drive(runId, steps) {
    for (let i = 0; i < 50; i++) {
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
    explore = await import("@/server/services/research/explore.ts");
    playersDb = await import("@/lib/research-players-db.server.ts");
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

  it("dedupes names by name_key and links both quotes", async () => {
    const topic = await rdb.createTopic(db, owner.id, `players ${process.pid}-${Date.now()}`);
    const source = await rdb.upsertSource(db, owner.id, {
      url: FORUM,
      urlKey: "forum.example.com/t/descript",
      site: "forum.example.com",
      kind: "thread",
      title: "Forum",
      markdown: PAGE,
      contentHash: "hash",
      publishedAt: null,
      addedBy: "search",
    });
    const inserted = await rdb.insertEvidence(db, [
      {
        userId: owner.id,
        topicId: topic.id,
        sourceId: source.id,
        runId: null,
        quote: QUOTE,
        kind: "pain",
        match: "exact",
        names: ["Descript"],
      },
      {
        userId: owner.id,
        topicId: topic.id,
        sourceId: source.id,
        runId: null,
        quote: "Descript Inc. is fine for short clips.",
        kind: "opinion",
        match: "exact",
        names: ["Descript Inc."],
      },
    ]);
    await playersDb.syncPlayersFromEvidence(db, owner.id, topic.id, inserted);
    const listed = await product.listResearchPlayers(owner.id, topic.id);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, "Descript");
    assert.equal(listed[0].evidenceCount, 2);
    await assert.rejects(product.listResearchPlayers(stranger.id, topic.id), (err) => err.status === 404);
  });

  it("fills player fields from homepage and pricing pages only", async () => {
    const topic = await rdb.createTopic(db, owner.id, `map ${process.pid}-${Date.now()}`);
    await ledger.grantResearchCredits(db, owner.id, 200, "test");
    const { run } = await runs.draftRun(
      owner.id,
      {
        topicId: topic.id,
        kind: "explore",
        depth: "quick",
        input: { seed: "podcast editing tools" },
      },
      explore.exploreDrafter({ generate: fakeGenerate }),
    );
    assert.equal(run.kind, "explore");
    assert.ok(run.plan.some((q) => /best/.test(q.query)));
    assert.ok(run.plan.some((q) => /alternatives/.test(q.query)));
    assert.ok(run.plan.some((q) => /directory/.test(q.query)));

    await ledger.reserveRunCredits(db, owner.id, run.id, 45, "start");
    await db.update(schema.researchRuns).set({ state: "queued" }).where(eq(schema.researchRuns.id, run.id));

    const finished = await drive(run.id, explore.exploreSteps({ generate: fakeGenerate, calls }));
    assert.equal(finished.state, "done", finished.error);
    const players = await product.listResearchPlayers(owner.id, topic.id);
    const descript = players.find((p) => p.name === "Descript");
    assert.ok(descript);
    assert.equal(descript.url, HOME);
    assert.equal(descript.oneLiner, "AI video editor for podcasters");
    assert.equal(descript.category, "video editor");
    assert.equal(descript.audience, "podcasters");
    assert.equal(descript.freePlan, true);
    assert.deepEqual(descript.pricing.plans, [{ name: "Creator", price: "$24/month" }]);
    assert.ok(descript.complaints >= 1);
  });
});
