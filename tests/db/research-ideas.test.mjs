import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb, skipWithoutDb, testUser } from "../support/db.mjs";

/**
 * Idea matching, naming and scoring against Postgres across two runs, with
 * the model faked: the first run creates ideas and names them; the second
 * adds to existing ideas instead of duplicating them, leaves a dismissed idea
 * dismissed (its quote attaches quietly), never renames an idea the user
 * renamed, keeps merged ideas out of matching, and scores only in code.
 */

const ORIGIN = "http://localhost:8080";

describe("discover: match, name, score", { skip: skipWithoutDb }, () => {
  const saved = {};
  let user;
  let db;
  let rdb;
  let ideasDb;
  let ledger;
  let runsDb;
  let runs;
  let ideas;
  let topic;
  let sources;
  const matchPrompts = [];
  let eq;
  let schema;

  /** Matches by keyword: an idea in the prompt whose title shares it, else a new one. */
  const fakeGenerate = async (_model, call) => {
    if (call.instructions.startsWith("You tidy the names")) {
      const labels = [...call.prompt.matchAll(/^(N\d+): (.+?) — /gm)];
      return {
        output: {
          ideas: labels.map(([, label, title]) => ({ idea: label, title: `Named: ${title}` })),
        },
        inputTokens: 300,
        outputTokens: 60,
        modelId: "fake",
      };
    }
    matchPrompts.push(call.prompt);
    const listed = [...call.prompt.matchAll(/^([ID]\d+): (.+?)(?: — .*)?$/gm)];
    const topics = [
      ["edit", "Editing takes hours"],
      ["expensive", "Tools cost too much"],
      ["noise", "Background noise ruins takes"],
      ["transcript", "Transcripts are inaccurate"],
    ];
    const matches = [...call.prompt.matchAll(/^(Q\d+): (.+)$/gm)].map(([, label, quote]) => {
      const [word, title] = topics.find(([w]) => quote.toLowerCase().includes(w));
      const known = listed.find(([, , t]) => t.toLowerCase().includes(word));
      return known
        ? { quote: label, idea: known[1] }
        : { quote: label, idea: "new", title, summary: `People hit this (${word}).` };
    });
    return { output: { matches }, inputTokens: 800, outputTokens: 120, modelId: "fake" };
  };

  async function queuedRun(seed) {
    const run = await rdb.createRun(db, user.id, topic.id, {
      kind: "discover",
      depth: "quick",
      input: { seed },
    });
    await ledger.grantResearchCredits(db, user.id, 30, "test");
    await ledger.reserveRunCredits(db, user.id, run.id, 30, "start");
    await db
      .update(schema.researchRuns)
      .set({ state: "queued" })
      .where(eq(schema.researchRuns.id, run.id));
    return run;
  }

  async function addEvidence(run, rows) {
    await rdb.insertEvidence(
      db,
      rows.map(([source, quote, extra = {}]) => ({
        userId: user.id,
        topicId: topic.id,
        sourceId: sources[source].id,
        runId: run.id,
        quote,
        kind: "pain",
        match: "exact",
        ...extra,
      })),
    );
  }

  async function runIdeaSteps(runId) {
    for (let i = 0; i < 20; i++) {
      let checks = 0;
      await runs.runResearch(runId, ORIGIN, {
        steps: ideas.ideaSteps({ generate: fakeGenerate }),
        timeLeftMs: () => (checks++ < 1 ? 1e9 : 0),
        handOff: async () => {},
      });
      const row = await runsDb.getRunById(db, runId);
      if (["done", "stopped", "failed"].includes(row.state)) return row;
    }
    throw new Error("run never ended");
  }

  const topicIdeas = () =>
    db.select().from(schema.researchIdeas).where(eq(schema.researchIdeas.topicId, topic.id));

  before(async () => {
    for (const k of [
      "FIRECRAWL_API_KEY",
      "OPENROUTER_API_KEY",
      "AI_MODELS",
      "VERCEL",
      "RESEARCH_WRITER_MODELS",
    ]) {
      saved[k] = process.env[k];
    }
    process.env.FIRECRAWL_API_KEY = "fc-test";
    process.env.OPENROUTER_API_KEY = "or-test";
    delete process.env.AI_MODELS;
    delete process.env.VERCEL;
    delete process.env.RESEARCH_WRITER_MODELS;
    ({ eq } = await import("drizzle-orm"));
    schema = await import("@/lib/schema.ts");
    db = await (await import("@/lib/db.server")).getDb();
    rdb = await import("@/lib/research-db.server.ts");
    ideasDb = await import("@/lib/research-ideas-db.server.ts");
    ledger = await import("@/lib/research-credits-db.server.ts");
    runsDb = await import("@/lib/research-runs-db.server.ts");
    runs = await import("@/server/services/research/runs.ts");
    ideas = await import("@/server/services/research/ideas.ts");
    user = await testUser();
    topic = await rdb.createTopic(db, user.id, "ideas");
    const page = (key, site) =>
      rdb.upsertSource(db, user.id, {
        url: `https://${key}`,
        urlKey: key,
        site,
        kind: "thread",
        title: key,
        markdown: "x",
        contentHash: "h",
        publishedAt: null,
        addedBy: "search",
      });
    sources = {
      reddit: await page(`reddit.com/r/p/comments/${process.pid}${Date.now()}`, "reddit.com"),
      hn: await page(
        `news.ycombinator.com/item?id=${process.pid}${Date.now()}`,
        "news.ycombinator.com",
      ),
    };
  });

  after(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await user?.cleanup();
    await closeDb();
  });

  it("builds up ideas across runs without duplicating, reviving or renaming them", async () => {
    const tag = `${process.pid}-${Date.now()}`; // keeps the model cache out of it
    const run1 = await queuedRun(`podcasts ${tag}`);
    await addEvidence(run1, [
      [
        "reddit",
        `Editing every episode takes me four hours ${tag}`,
        { authorKey: "a", strong: true },
      ],
      ["hn", `I hate editing out the ums and uhs ${tag}`, { authorKey: "b", sentiment: -2 }],
      ["reddit", `Editing is the worst part of podcasting ${tag}`],
      ["reddit", `Every tool is too expensive for a hobby ${tag}`, { pays: true }],
      [
        "hn",
        `Riverside got expensive after the price change ${tag}`,
        { pays: true, names: ["Riverside"] },
      ],
      ["reddit", `Background noise from my street ruins takes ${tag}`],
      ["reddit", `Descript is great ${tag}`, { kind: "competitor", names: ["Descript"] }],
    ]);

    const done1 = await runIdeaSteps(run1.id);
    assert.equal(done1.state, "done");
    assert.equal(done1.progress.ideasNew, 3);
    assert.equal(done1.progress.ideasTouched, 3);
    let all = await topicIdeas();
    assert.equal(all.length, 3, "a competitor quote is evidence, not an idea");
    const find = (word) => all.find((i) => i.title.toLowerCase().includes(word));
    assert.ok(
      all.every((i) => i.title.startsWith("Named: ")),
      "the naming pass ran",
    );
    const editing = find("edit");
    assert.equal(editing.evidenceCount, 3);
    assert.equal(editing.firstRunId, run1.id);
    assert.equal(editing.addedLastRun, 3);
    assert.ok(editing.scoreTotal > 0);
    assert.equal(editing.score.intensity, 0.458, "2 of 3 felt, plus 3 average quotes: 2.75 / 6");
    assert.equal(find("cost").score.pays, 0.4);
    assert.equal(find("cost").score.competition, "some");

    // The user dismisses noise, renames editing, and merges cost into editing.
    const noise = find("noise");
    await db
      .update(schema.researchIdeas)
      .set({ status: "dismissed" })
      .where(eq(schema.researchIdeas.id, noise.id));
    await db
      .update(schema.researchIdeas)
      .set({ title: "My editing idea", namedBy: "user" })
      .where(eq(schema.researchIdeas.id, editing.id));
    const cost = find("cost");
    await db
      .update(schema.researchIdeas)
      .set({ status: "merged", mergedInto: editing.id })
      .where(eq(schema.researchIdeas.id, cost.id));

    const run2 = await queuedRun(`podcasts ${tag}`);
    await addEvidence(run2, [
      ["hn", `Still editing every episode by hand ${tag}`, { authorKey: "c" }],
      ["reddit", `My neighbour's noise is in every recording ${tag}`],
      ["hn", `Auto transcripts get every name wrong ${tag}`, { strong: true }],
    ]);
    const done2 = await runIdeaSteps(run2.id);
    assert.equal(done2.state, "done");
    assert.equal(done2.progress.ideasNew, 1);
    assert.equal(done2.progress.ideasTouched, 3);
    assert.ok(
      !matchPrompts.at(-1).includes(cost.title),
      "merged ideas aren't offered to the matcher",
    );

    all = await topicIdeas();
    assert.equal(all.length, 4, "editing and noise were added to, not duplicated");
    const edit2 = all.find((i) => i.id === editing.id);
    assert.equal(edit2.title, "My editing idea", "a user's name is never replaced");
    assert.equal(edit2.evidenceCount, 4);
    assert.equal(edit2.addedLastRun, 1);
    assert.equal(edit2.lastRunId, run2.id);
    const noise2 = all.find((i) => i.id === noise.id);
    assert.equal(noise2.status, "dismissed", "dismissed stays dismissed");
    assert.equal(noise2.evidenceCount, 2);
    const transcripts = all.find((i) => i.firstRunId === run2.id);
    assert.equal(transcripts.title, "Named: Transcripts are inaccurate");
    assert.equal(all.find((i) => i.id === cost.id).status, "merged");
  });

  it("only renames ideas the model named", async () => {
    const [idea] = await ideasDb.liveIdeasForMatching(db, topic.id, 1);
    await db
      .update(schema.researchIdeas)
      .set({ namedBy: "user" })
      .where(eq(schema.researchIdeas.id, idea.id));
    await ideasDb.renameModelIdea(db, idea.id, "Changed", "x");
    assert.equal((await ideasDb.getIdea(db, idea.id)).title, idea.title);
  });
});
