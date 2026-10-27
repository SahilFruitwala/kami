import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb, skipWithoutDb, testUser } from "../support/db.mjs";

/**
 * Discover's plan, search and triage against Postgres, with Firecrawl and
 * the model faked: a draft flags queries the topic already sent; a run sends
 * each checked query exactly once even when handed off after every unit;
 * triage reads stored results (no new searches), drops what code screens
 * out, and leaves the picks in progress.toRead.
 */

const ORIGIN = "http://localhost:8080";

describe("discover: plan, search, triage", { skip: skipWithoutDb }, () => {
  const saved = {};
  let user;
  let db;
  let rdb;
  let ledger;
  let runsDb;
  let runs;
  let discover;
  let topic;
  const searches = [];
  const modelCalls = [];

  const fakeSearch = async (query) => {
    searches.push(query);
    const slug = query.replace(/\W+/g, "-");
    return {
      credits: 2,
      results: [
        {
          url: `https://www.reddit.com/r/podcasting/comments/${slug}/x/`,
          title: "Editing is so frustrating, is there a tool?",
          description: "I hate spending hours",
        },
        { url: "https://forum.example.com/t/shared/1", title: "Shared thread", description: "" },
        { url: `https://www.youtube.com/watch?v=${slug}`, title: "Video", description: "" },
        { url: "https://blog.example.com/blog/top", title: "Top 10 best editors", description: "" },
      ],
    };
  };

  /** Hacker News searches go to its free API; this fake records them and returns the same hits. */
  const hnSearches = [];
  const fakeHnSearch = async (query) => {
    hnSearches.push(query);
    return (await fakeSearch(`${query} site:news.ycombinator.com`)).results;
  };
  const calls = { search: fakeSearch, hnSearch: fakeHnSearch };

  /** Plans three queries (one a repeat); triage reads everything except listicles. */
  const fakeGenerate = async (_model, call) => {
    modelCalls.push(call);
    if (call.prompt.includes("Results:")) {
      const lines = call.prompt.split("\n").filter((l) => /^\d+\. /.test(l));
      const read = lines.filter((l) => !/Top 10/.test(l)).map((l) => Number(l.split(".")[0]));
      return { output: { read }, inputTokens: 900, outputTokens: 20, modelId: "fake" };
    }
    return {
      output: {
        queries: [
          { query: "podcast editing frustrating", site: "reddit.com", intent: "pain" },
          { query: "already searched this", intent: "pain" },
          { query: "riverside alternative", site: "news.ycombinator.com", intent: "alternatives" },
          { query: "wish podcast tool", intent: "wish" },
        ],
      },
      inputTokens: 700,
      outputTokens: 150,
      modelId: "fake",
    };
  };

  before(async () => {
    for (const k of [
      "FIRECRAWL_API_KEY",
      "OPENROUTER_API_KEY",
      "AI_MODELS",
      "VERCEL",
      "RESEARCH_WRITER_MODELS",
      "REDDIT_CLIENT_ID",
      "REDDIT_CLIENT_SECRET",
    ]) {
      saved[k] = process.env[k];
    }
    process.env.FIRECRAWL_API_KEY = "fc-test";
    process.env.OPENROUTER_API_KEY = "or-test";
    delete process.env.AI_MODELS;
    delete process.env.VERCEL;
    delete process.env.RESEARCH_WRITER_MODELS;
    // Reddit's API is set up, so triage may pick Reddit threads.
    process.env.REDDIT_CLIENT_ID = "reddit-id";
    process.env.REDDIT_CLIENT_SECRET = "reddit-secret";
    db = await (await import("@/lib/db.server")).getDb();
    rdb = await import("@/lib/research-db.server.ts");
    ledger = await import("@/lib/research-credits-db.server.ts");
    runsDb = await import("@/lib/research-runs-db.server.ts");
    runs = await import("@/server/services/research/runs.ts");
    discover = await import("@/server/services/research/discover.ts");
    user = await testUser();
    // A unique topic name keeps the model cache from answering for an older test run.
    topic = await rdb.createTopic(db, user.id, `podcasters ${process.pid}-${Date.now()}`);
  });

  after(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await user?.cleanup();
    await closeDb();
  });

  it("drafts a plan, flags what the topic already searched, and runs search and triage", async () => {
    // An earlier run in this topic already sent one of the queries.
    const earlier = await rdb.createRun(db, user.id, topic.id, {
      kind: "discover",
      depth: "quick",
      input: { seed: "x" },
    });
    await rdb.insertRunQuery(db, {
      userId: user.id,
      topicId: topic.id,
      runId: earlier.id,
      queryNorm: "already searched this",
      hits: [],
    });

    const { run } = await runs.draftRun(
      user.id,
      {
        topicId: topic.id,
        kind: "discover",
        input: { seed: `tools for indie podcasters ${topic.id}` },
        depth: "quick",
      },
      discover.discoverDrafter({ generate: fakeGenerate }),
    );
    assert.equal(run.state, "awaiting_plan");
    assert.equal(run.tokensIn, 700);
    assert.equal(run.plan.length, 4);
    const repeat = run.plan.find((q) => q.query === "already searched this");
    assert.equal(repeat.repeat, true);
    assert.equal(repeat.checked, false);
    assert.equal(run.plan.filter((q) => q.checked).length, 3);

    // Queue it as startRun would, without kicking the live background loop.
    await ledger.grantResearchCredits(db, user.id, 30, "test");
    await ledger.reserveRunCredits(db, user.id, run.id, 30, "start");
    const { eq } = await import("drizzle-orm");
    const { researchRuns } = await import("@/lib/schema.ts");
    await db.update(researchRuns).set({ state: "queued" }).where(eq(researchRuns.id, run.id));

    // Just search and triage; reading the picks is covered in research-evidence.test.mjs.
    const steps = discover
      .discoverSteps({ calls, generate: fakeGenerate })
      .filter((s) => s.name === "search" || s.name === "triage");
    let row;
    for (let i = 0; i < 20; i++) {
      let checks = 0;
      await runs.runResearch(run.id, ORIGIN, {
        steps,
        timeLeftMs: () => (checks++ < 1 ? 1e9 : 0),
        handOff: async () => {},
      });
      row = await runsDb.getRunById(db, run.id);
      if (row.state === "done") break;
    }

    assert.equal(row.state, "done");
    assert.deepEqual(searches, [
      "podcast editing frustrating site:reddit.com",
      "riverside alternative site:news.ycombinator.com",
      "wish podcast tool",
    ]);
    assert.equal((await rdb.runQueries(db, run.id)).length, 3);
    assert.equal(row.progress.searched, 3);

    // 3 Reddit threads + 1 shared forum thread; video and duplicates gone; the listicle triaged out.
    assert.equal(row.progress.candidates, 5);
    assert.equal(row.progress.toRead.length, 4);
    assert.ok(row.progress.toRead.every((u) => !u.includes("youtube") && !u.includes("/top")));
    assert.ok(row.progress.toRead[0].includes("reddit.com"), "best-scored first");
    assert.equal(modelCalls.filter((c) => c.prompt.includes("Results:")).length, 1);

    assert.deepEqual(hnSearches, ["riverside alternative"], "Hacker News went to its free API");

    // 2 Firecrawl searches at 2 credits (HN is free) + ceil((700+150+900+20) / 20,000) = 5.
    assert.equal(row.firecrawlCredits, 4);
    assert.equal(row.chargedCredits, 5);
  });

  it("reuses the topic's stored results for a query it already sent, for free", async () => {
    // The first test sent these queries in this topic; run them again.
    const run = await rdb.createRun(db, user.id, topic.id, {
      kind: "discover",
      depth: "quick",
      input: { seed: "again" },
    });
    await ledger.grantResearchCredits(db, user.id, 45, "test");
    await ledger.reserveRunCredits(db, user.id, run.id, 45, "start");
    const { eq } = await import("drizzle-orm");
    const { researchRuns } = await import("@/lib/schema.ts");
    await db
      .update(researchRuns)
      .set({
        state: "queued",
        plan: [
          {
            id: "q1",
            query: "podcast editing frustrating",
            site: "reddit.com",
            intent: "pain",
            checked: true,
          },
          { id: "q2", query: "brand new query", intent: "pain", checked: true },
        ],
      })
      .where(eq(researchRuns.id, run.id));
    const before = searches.length;
    const steps = discover
      .discoverSteps({ calls, generate: fakeGenerate })
      .filter((s) => s.name === "search");
    await runs.runResearch(run.id, ORIGIN, { steps, handOff: async () => {} });

    const row = await runsDb.getRunById(db, run.id);
    assert.deepEqual(
      searches.slice(before),
      ["brand new query"],
      "only the new query was paid for",
    );
    assert.equal(row.progress.reusedSearches, 1);
    assert.equal(row.firecrawlCredits, 2);
    const stored = await rdb.runQueries(db, run.id);
    assert.equal(stored.length, 2);
    assert.equal(stored[0].hits.length, 4, "the earlier search's results, copied");
  });

  it("leaves Reddit threads out of triage while Reddit's API isn't set up", async () => {
    const run = await rdb.createRun(db, user.id, topic.id, {
      kind: "discover",
      depth: "quick",
      input: { seed: `no reddit ${process.pid}-${Date.now()}` },
    });
    await rdb.insertRunQuery(db, {
      userId: user.id,
      topicId: topic.id,
      runId: run.id,
      queryNorm: "no reddit",
      hits: (await fakeSearch(`no reddit ${run.id}`)).results,
    });
    searches.pop();
    await ledger.grantResearchCredits(db, user.id, 30, "test");
    await ledger.reserveRunCredits(db, user.id, run.id, 30, "start");
    const { eq } = await import("drizzle-orm");
    const { researchRuns } = await import("@/lib/schema.ts");
    await db.update(researchRuns).set({ state: "queued" }).where(eq(researchRuns.id, run.id));

    delete process.env.REDDIT_CLIENT_SECRET;
    try {
      const steps = discover
        .discoverSteps({ calls, generate: fakeGenerate })
        .filter((s) => s.name === "triage");
      await runs.runResearch(run.id, ORIGIN, { steps, handOff: async () => {} });
    } finally {
      process.env.REDDIT_CLIENT_SECRET = "reddit-secret";
    }

    const row = await runsDb.getRunById(db, run.id);
    assert.equal(row.state, "done");
    assert.ok(row.progress.toRead.length > 0);
    assert.ok(row.progress.toRead.every((u) => !u.includes("reddit.com")));
    assert.deepEqual(row.progress.spares, []);
  });

  it("refuses an edited plan with nothing checked", async () => {
    await assert.rejects(
      discover.validateEditedPlan(
        { input: { seed: "x" }, topicId: topic.id },
        [{ query: "a", checked: false }],
        "quick",
      ),
      (err) => err.status === 400,
    );
  });
});
