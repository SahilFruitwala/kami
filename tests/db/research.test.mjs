import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { closeDb, skipWithoutDb, testUser } from "../support/db.mjs";

describe("research tables", { skip: skipWithoutDb }, () => {
  let owner;
  let other;
  let rdb;
  let db;
  let schema;

  const page = (urlKey, markdown = "The editing takes hours every week.") => ({
    url: `https://${urlKey}`,
    urlKey,
    site: "reddit.com",
    kind: "thread",
    title: "Thread",
    markdown,
    contentHash: "h",
    publishedAt: null,
    addedBy: "search",
  });

  before(async () => {
    rdb = await import("@/lib/research-db.server.ts");
    schema = await import("@/lib/schema.ts");
    db = await (await import("@/lib/db.server")).getDb();
    owner = await testUser();
    other = await testUser();
  });

  after(async () => {
    await owner?.cleanup();
    await other?.cleanup();
    await closeDb();
  });

  it("scopes topics and runs to their owner", async () => {
    const topic = await rdb.createTopic(db, owner.id, "  tools for   indie podcasters  ");
    assert.equal(topic.name, "tools for indie podcasters");
    const run = await rdb.createRun(db, owner.id, topic.id, {
      kind: "discover",
      depth: "quick",
      input: { seed: "tools for indie podcasters" },
    });
    assert.equal(run.state, "drafting");

    assert.equal(await rdb.getTopic(db, other.id, topic.id), null);
    assert.equal(await rdb.getRun(db, other.id, run.id), null);
    assert.equal(await rdb.renameTopic(db, other.id, topic.id, "mine now"), false);
    assert.equal(await rdb.deleteTopic(db, other.id, topic.id), false);
    assert.deepEqual(await rdb.listTopics(db, other.id), []);

    const [listed] = await rdb.listTopics(db, owner.id);
    assert.equal(listed.id, topic.id);
    assert.equal(listed.liveIdeas, 0);
    assert.ok(listed.lastRunAt instanceof Date);
  });

  it("keeps one cached source per user and url_key, updated in place", async () => {
    const first = await rdb.upsertSource(db, owner.id, page("reddit.com/r/podcasting/1"));
    const again = await rdb.upsertSource(
      db,
      owner.id,
      page("reddit.com/r/podcasting/1", "Newer copy."),
    );
    assert.equal(again.id, first.id);
    assert.equal(again.markdown, "Newer copy.");

    const theirs = await rdb.upsertSource(db, other.id, page("reddit.com/r/podcasting/1"));
    assert.notEqual(theirs.id, first.id);

    const found = await rdb.sourcesByUrlKey(db, owner.id, ["reddit.com/r/podcasting/1"]);
    assert.equal(found.get("reddit.com/r/podcasting/1")?.id, first.id);
  });

  it("never stores the same quote from a source twice in a topic", async () => {
    const topic = await rdb.createTopic(db, owner.id, "dupes");
    const source = await rdb.upsertSource(db, owner.id, page("news.ycombinator.com/item?id=1"));
    await rdb.linkTopicSource(db, topic.id, source.id, null);
    await rdb.linkTopicSource(db, topic.id, source.id, null);
    assert.deepEqual(
      [...(await rdb.topicUrlKeys(db, owner.id, topic.id))],
      ["news.ycombinator.com/item?id=1"],
    );

    const quote = {
      userId: owner.id,
      topicId: topic.id,
      sourceId: source.id,
      quote: "The editing takes hours every week.",
      kind: "pain",
      match: "exact",
    };
    await db.insert(schema.researchEvidence).values({ id: randomUUID(), ...quote });
    await assert.rejects(
      db.insert(schema.researchEvidence).values({ id: randomUUID(), ...quote }),
      (err) => /research_evidence_quote_idx/.test(String(err?.cause?.message ?? err?.message)),
    );
  });

  it("deleting a topic removes its runs but keeps the source cache", async () => {
    const topic = await rdb.createTopic(db, owner.id, "to delete");
    const run = await rdb.createRun(db, owner.id, topic.id, {
      kind: "discover",
      depth: "deep",
      input: { seed: "x" },
    });
    const source = await rdb.upsertSource(db, owner.id, page("example.com/kept"));
    await rdb.linkTopicSource(db, topic.id, source.id, run.id);

    assert.equal(await rdb.deleteTopic(db, owner.id, topic.id), true);
    assert.equal(await rdb.getRun(db, owner.id, run.id), null);
    assert.ok(
      (await rdb.sourcesByUrlKey(db, owner.id, ["example.com/kept"])).has("example.com/kept"),
    );
  });
});
