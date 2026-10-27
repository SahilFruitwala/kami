import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb, skipWithoutDb, testUser } from "../support/db.mjs";

/**
 * The Research product API (tickets 10–13) against Postgres, with every
 * outside call faked: the section is hidden while Research is off, topics
 * and ideas are owner-scoped, merges, dismissals and renames survive the next
 * run, and a pasted link adds checked evidence once (pasting it again reads
 * the cached page and adds nothing).
 */

const ORIGIN = "http://localhost:8080";

describe("research product API", { skip: skipWithoutDb }, () => {
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
  let topics;
  let product;
  let discover;
  let ideas;

  /** Matches quotes to ideas by keyword, like tests/db/research-ideas.test.mjs. */
  const KEYWORDS = [
    ["edit", "Editing takes hours"],
    ["expensive", "Tools cost too much"],
    ["noise", "Background noise ruins takes"],
    ["transcript", "Transcripts are inaccurate"],
  ];
  const PAGE =
    "Podcast editing takes hours every single week and it is so frustrating.\n\nPodcast editing tools are fine otherwise.";
  const QUOTE = "Podcast editing takes hours every single week and it is so frustrating.";

  const fakeGenerate = async (_model, call) => {
    if (call.instructions.startsWith("You pull out")) {
      const label = call.prompt.match(/source="(S\d+)"/)?.[1] ?? "S1";
      return {
        output: {
          quotes: [{ source: label, quote: QUOTE, kind: "pain", sentiment: -2, strong: true }],
        },
        inputTokens: 500,
        outputTokens: 50,
        modelId: "fake",
      };
    }
    if (call.instructions.startsWith("You tidy the names")) {
      return { output: { ideas: [] }, inputTokens: 100, outputTokens: 10, modelId: "fake" };
    }
    const listed = [...call.prompt.matchAll(/^([ID]\d+): (.+?)(?: — .*)?$/gm)];
    const matches = [...call.prompt.matchAll(/^(Q\d+): (.+)$/gm)].map(([, label, quote]) => {
      const [word, title] = KEYWORDS.find(([w]) => quote.toLowerCase().includes(w));
      const known = listed.find(([, , t]) => t.toLowerCase().includes(word));
      return known
        ? { quote: label, idea: known[1] }
        : { quote: label, idea: "new", title, summary: `People hit this (${word}).` };
    });
    return { output: { matches }, inputTokens: 800, outputTokens: 120, modelId: "fake" };
  };

  async function drive(runId, steps) {
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
    topics = await import("@/server/services/research/topics.ts");
    product = await import("@/server/services/research/product.ts");
    discover = await import("@/server/services/research/discover.ts");
    ideas = await import("@/server/services/research/ideas.ts");
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

  it("is hidden while Research is off: status says so and every other route is a 404", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    try {
      assert.deepEqual(await topics.researchStatus(owner.id), {
        enabled: false,
        balance: 0,
        writerModel: false,
      });
      await assert.rejects(topics.researchTopics(owner.id), (err) => err.status === 404);
      await assert.rejects(topics.researchCredits(owner.id), (err) => err.status === 404);
    } finally {
      process.env.FIRECRAWL_API_KEY = "fc-test";
    }
    const on = await topics.researchStatus(owner.id);
    assert.equal(on.enabled, true);
    assert.equal(on.balance, 0, "everyone starts with nothing");
  });

  it("keeps topics, ideas and runs to their owner", async () => {
    const topic = await topics.newResearchTopic(owner.id, `mine ${process.pid}-${Date.now()}`);
    const idea = await ideasDbCreate(topic.id);
    const notFound = (err) => err.status === 404;

    await assert.rejects(topics.researchTopic(stranger.id, topic.id), notFound);
    await assert.rejects(topics.renameResearchTopic(stranger.id, topic.id, "x"), notFound);
    await assert.rejects(topics.deleteResearchTopic(stranger.id, topic.id), notFound);
    await assert.rejects(product.listTopicIdeas(stranger.id, topic.id, "live"), notFound);
    await assert.rejects(product.listTopicSources(stranger.id, topic.id), notFound);
    await assert.rejects(product.researchIdea(stranger.id, idea.id), notFound);
    await assert.rejects(
      product.patchIdea(stranger.id, idea.id, { status: "dismissed" }),
      notFound,
    );
    assert.ok(!(await topics.researchTopics(stranger.id)).some((t) => t.id === topic.id));

    const mine = await topics.researchTopic(owner.id, topic.id);
    assert.equal(mine.topic.name, topic.name);
    assert.equal((await product.listTopicIdeas(owner.id, topic.id, "live")).length, 1);
  });

  async function ideasDbCreate(topicId) {
    const ideasDb = await import("@/lib/research-ideas-db.server.ts");
    const id = await ideasDb.createIdea(db, {
      userId: owner.id,
      topicId,
      title: "Something hurts",
      summary: "",
      runId: "none",
    });
    return { id };
  }

  it("keeps merges, dismissals and renames through the next run", async () => {
    const topic = await rdb.createTopic(db, owner.id, `podcasting ${process.pid}-${Date.now()}`);
    const source = await rdb.upsertSource(db, owner.id, {
      url: `https://forum.example.com/t/${process.pid}${Date.now()}`,
      urlKey: `forum.example.com/t/${process.pid}${Date.now()}`,
      site: "forum.example.com",
      kind: "thread",
      title: "Forum",
      markdown: "x",
      contentHash: "h",
      publishedAt: null,
      addedBy: "search",
    });
    const run = async (quotes) => {
      const row = await rdb.createRun(db, owner.id, topic.id, {
        kind: "discover",
        depth: "quick",
        input: { seed: "podcasting" },
      });
      await ledger.grantResearchCredits(db, owner.id, 30, "test");
      await ledger.reserveRunCredits(db, owner.id, row.id, 30, "start");
      await db
        .update(schema.researchRuns)
        .set({ state: "queued" })
        .where(eq(schema.researchRuns.id, row.id));
      await rdb.insertEvidence(
        db,
        quotes.map((quote) => ({
          userId: owner.id,
          topicId: topic.id,
          sourceId: source.id,
          runId: row.id,
          quote,
          kind: "pain",
          match: "exact",
        })),
      );
      return drive(row.id, ideas.ideaSteps({ generate: fakeGenerate }));
    };
    const byTitle = async (status = "live") =>
      Object.fromEntries(
        (await product.listTopicIdeas(owner.id, topic.id, status)).map((i) => [i.title, i]),
      );

    await run([
      "edit one takes all evening",
      "edit two is a slog",
      "expensive plans for a hobby",
      "noise from the street",
      "transcript full of mistakes",
    ]);
    const first = await byTitle();
    const edit = first["Editing takes hours"];
    const cost = first["Tools cost too much"];
    const transcript = first["Transcripts are inaccurate"];
    const noise = first["Background noise ruins takes"];
    assert.ok(edit && cost && transcript && noise, "four ideas");
    assert.ok(edit.isNew, "the latest run created it");

    const merged = await product.mergeResearchIdeas(owner.id, {
      intoId: edit.id,
      fromIds: [cost.id],
    });
    assert.equal(merged.evidenceCount, 3, "the merged idea's quote moved over");
    await product.patchIdea(owner.id, noise.id, { status: "dismissed" });
    await product.patchIdea(owner.id, transcript.id, { title: "My transcripts are wrong" });

    await run([
      "edit three never ends",
      "noise again from neighbours",
      "transcript misspells every name",
    ]);
    // A plan discarded afterwards never ran, so the badges still come from the run.
    const draft = await rdb.createRun(db, owner.id, topic.id, {
      kind: "discover",
      depth: "quick",
      input: { seed: "discarded" },
    });
    await db
      .update(schema.researchRuns)
      .set({ state: "stopped", stopReason: "user", chargedCredits: 0, finishedAt: new Date() })
      .where(eq(schema.researchRuns.id, draft.id));
    const second = await byTitle();
    assert.equal(second["Editing takes hours"].evidenceCount, 4);
    assert.equal(second["Editing takes hours"].addedLastRun, 1, "+1 from the latest run");
    assert.equal(second["My transcripts are wrong"]?.evidenceCount, 2, "rename kept, quote added");
    assert.ok(!second["Background noise ruins takes"], "still dismissed");
    const dismissed = await byTitle("dismissed");
    assert.equal(dismissed["Background noise ruins takes"].evidenceCount, 2, "attached quietly");
    const [mergedRow] = await db
      .select()
      .from(schema.researchIdeas)
      .where(eq(schema.researchIdeas.id, cost.id));
    assert.equal(mergedRow.status, "merged");
    assert.equal(mergedRow.mergedInto, edit.id);

    await assert.rejects(
      product.mergeResearchIdeas(owner.id, { intoId: edit.id, fromIds: [cost.id] }),
      (err) => err.status === 400,
      "an idea can't be merged twice",
    );
  });

  it("reads a pasted link into the topic once; pasting it again adds nothing", async () => {
    const topic = await rdb.createTopic(db, owner.id, "podcast editing");
    const url = `https://forum.example.com/t/editing-${process.pid}-${Date.now()}/1`;
    const scraped = [];
    const calls = {
      scrape: async (u) => {
        scraped.push(u);
        return { markdown: PAGE, title: "Editing thread", publishedAt: null, credits: 1 };
      },
    };
    const steps = discover.discoverSteps({ calls, generate: fakeGenerate });
    await ledger.grantResearchCredits(db, owner.id, 20, "test");

    const first = await runs.createLinkRun(owner.id, topic.id, url);
    assert.equal(first.step, "fetch");
    assert.equal(first.budgetCredits, 5);
    const done = await drive(first.id, steps);
    assert.equal(done.state, "done");
    assert.equal(done.firecrawlCredits, 1);

    const sources = await product.listTopicSources(owner.id, topic.id);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].addedBy, "link");
    assert.equal(sources[0].evidenceCount, 1);
    const [idea] = await product.listTopicIdeas(owner.id, topic.id, "live");
    assert.equal(idea.title, "Editing takes hours");
    const detail = await product.researchIdea(owner.id, idea.id);
    assert.equal(detail.evidence[0].quote, QUOTE);
    assert.equal(detail.evidence[0].source.url, url);

    const again = await runs.createLinkRun(owner.id, topic.id, url);
    const second = await drive(again.id, steps);
    assert.equal(second.state, "done");
    assert.equal(scraped.length, 1, "the cached page was reused");
    assert.equal(second.firecrawlCredits, 0);
    assert.equal((await product.listTopicSources(owner.id, topic.id))[0].evidenceCount, 1);
    assert.equal((await product.listTopicIdeas(owner.id, topic.id, "live"))[0].evidenceCount, 1);

    const summary = (await topics.researchTopic(owner.id, topic.id)).runs;
    assert.equal(summary.length, 2);
    assert.ok(summary.every((r) => r.addedBy === "link"));
  });
});
