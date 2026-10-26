import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { closeDb, skipWithoutDb, testUser } from "../support/db.mjs";

/**
 * The source cache against Postgres, with Firecrawl faked: a fresh cached
 * page makes no call and costs nothing, a stale one is read again and kept
 * in place, the budget is checked before every paid call, and what Firecrawl
 * reports is what the run is charged.
 */

describe("research source cache", { skip: skipWithoutDb }, () => {
  let user;
  let db;
  let rdb;
  let fetch;
  let topic;
  let calls;
  let spent;
  let refuse;

  const meter = {
    ensureBudget(worst) {
      if (refuse) throw new Error("over budget");
      calls.checks.push(worst);
    },
    async recordSpend(spend) {
      spent += spend.firecrawlCredits ?? 0;
    },
  };

  const page = (markdown) => ({ markdown, title: "Thread", publishedAt: null, credits: 1 });
  const fakes = (now = Date.now()) => ({
    now: () => now,
    scrape: async (url) => {
      calls.scrape.push(url);
      return page(
        "[Home](/)\n[Docs](/d)\n[Blog](/b)\n\nEditing takes **hours**. See [this](https://x.y).",
      );
    },
    search: async (query, limit) => {
      calls.search.push({ query, limit });
      return { results: [{ url: "https://a.com", title: "A", description: "" }], credits: 2 };
    },
  });

  const request = (url, over = {}) => ({
    userId: user.id,
    topicId: topic.id,
    runId: null,
    url,
    addedBy: "search",
    maxPageChars: 60_000,
    ...over,
  });

  before(async () => {
    db = await (await import("@/lib/db.server")).getDb();
    rdb = await import("@/lib/research-db.server.ts");
    fetch = await import("@/server/services/research/fetch.ts");
    user = await testUser();
    topic = await rdb.createTopic(db, user.id, "fetch");
  });

  beforeEach(() => {
    calls = { scrape: [], search: [], checks: [] };
    spent = 0;
    refuse = false;
  });

  after(async () => {
    await user?.cleanup();
    await closeDb();
  });

  it("reads a new page once, trims it, and charges what Firecrawl reported", async () => {
    const url = "https://www.reddit.com/r/podcasting/comments/abc/slug/";
    const first = await fetch.getOrFetchSource(meter, request(url), fakes());
    assert.equal(first.cached, false);
    assert.equal(first.source.urlKey, "reddit.com/r/podcasting/comments/abc");
    assert.equal(first.source.kind, "thread");
    assert.equal(first.source.site, "reddit.com");
    assert.equal(first.source.markdown, "Editing takes **hours**. See this.");
    assert.deepEqual(calls.checks, [{ firecrawlCredits: 1 }]);
    assert.equal(spent, 1);
    assert.ok((await rdb.topicUrlKeys(db, user.id, topic.id)).has(first.source.urlKey));

    const again = await fetch.getOrFetchSource(
      meter,
      request("https://old.reddit.com/r/podcasting/comments/abc/"),
      fakes(),
    );
    assert.equal(again.cached, true);
    assert.equal(again.source.id, first.source.id);
    assert.equal(calls.scrape.length, 1, "the cache hit made no Firecrawl call");
    assert.equal(spent, 1, "and cost nothing");
  });

  it("reads a stale page again, keeping the same source row", async () => {
    const url = "https://example.com/pricing";
    const first = await fetch.getOrFetchSource(meter, request(url), fakes());
    const eightDaysLater = Date.now() + 8 * 86_400_000;
    const second = await fetch.getOrFetchSource(meter, request(url), fakes(eightDaysLater));
    assert.equal(second.cached, false);
    assert.equal(second.source.id, first.source.id);
    assert.equal(calls.scrape.length, 2);
  });

  it("checks the budget before reading and never calls Firecrawl when it doesn't fit", async () => {
    refuse = true;
    await assert.rejects(
      fetch.getOrFetchSource(meter, request("https://example.com/new-page"), fakes()),
      /over budget/,
    );
    await assert.rejects(fetch.searchForRun(meter, "q", 15, {}, fakes()), /over budget/);
    assert.equal(calls.scrape.length, 0);
    assert.equal(calls.search.length, 0);
  });

  it("refuses PDFs and non-web URLs without spending", async () => {
    await assert.rejects(
      fetch.getOrFetchSource(meter, request("https://example.com/report.pdf"), fakes()),
      /only reads web pages/,
    );
    assert.equal(calls.checks.length, 0);
  });

  it("checks a search against its most expensive outcome and charges the reported cost", async () => {
    const results = await fetch.searchForRun(meter, "podcast editing frustrating", 15, {}, fakes());
    assert.equal(results.length, 1);
    assert.deepEqual(calls.checks, [{ firecrawlCredits: 4 }]);
    assert.equal(spent, 2);
  });
});
