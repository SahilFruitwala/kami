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
    const tag = `${process.pid}${Date.now()}`;
    const url = `https://www.forum.example.com/t/editing-${tag}/42/?utm_source=x`;
    const first = await fetch.getOrFetchSource(meter, request(url), fakes());
    assert.equal(first.cached, false);
    assert.equal(first.source.urlKey, `forum.example.com/t/editing-${tag}/42`);
    assert.equal(first.source.kind, "thread");
    assert.equal(first.source.site, "forum.example.com");
    assert.equal(first.source.markdown, "Editing takes **hours**. See this.");
    assert.deepEqual(calls.checks, [{ firecrawlCredits: 1 }]);
    assert.equal(spent, 1);
    assert.ok((await rdb.topicUrlKeys(db, user.id, topic.id)).has(first.source.urlKey));

    const again = await fetch.getOrFetchSource(
      meter,
      request(`https://forum.example.com/t/editing-${tag}/42`),
      fakes(),
    );
    assert.equal(again.cached, true);
    assert.equal(again.source.id, first.source.id);
    assert.equal(calls.scrape.length, 1, "the cache hit made no Firecrawl call");
    assert.equal(spent, 1, "and cost nothing");
  });

  it("reads Reddit threads through Reddit, free and spaced out, never through Firecrawl", async () => {
    fetch.resetRedditPacing();
    let clock = 1_000_000;
    const reads = [];
    const waits = [];
    const thread = (url) => ({
      title: "Audio editing sucks",
      markdown: `# Audio editing sucks\n\n---\n\n**u/a** · 2025-01-02 · 40 points\n\nI spend four hours editing ${url}`,
      publishedAt: new Date("2025-01-01"),
    });
    const reddit = {
      ...fakes(),
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
      redditThread: async (url) => {
        reads.push(url);
        return thread(url);
      },
    };
    const tag = `${process.pid}${Date.now()}`;
    const a = await fetch.getOrFetchSource(
      meter,
      request(`https://www.reddit.com/r/podcasting/comments/a${tag}/slug/`),
      reddit,
    );
    clock += 1_000;
    await fetch.getOrFetchSource(
      meter,
      request(`https://old.reddit.com/r/podcasting/comments/b${tag}/`),
      reddit,
    );
    assert.equal(reads.length, 2);
    assert.deepEqual(waits, [5_500], "the second read waited out the 6.5 s gap");
    assert.equal(calls.scrape.length, 0);
    assert.deepEqual(calls.checks, [], "free: no budget check");
    assert.equal(spent, 0);
    assert.equal(a.source.kind, "thread");
    assert.equal(a.source.site, "reddit.com");
    assert.match(a.source.markdown, /\*\*u\/a\*\* · 2025-01-02/, "not trimmed like a scraped page");
    assert.equal(a.source.publishedAt.toISOString(), "2025-01-01T00:00:00.000Z");
  });

  it("searches and reads Hacker News through its free API", async () => {
    const hn = {
      ...fakes(),
      hnSearch: async (query, limit) => {
        calls.search.push({ query, limit, hn: true });
        return [
          { url: "https://news.ycombinator.com/item?id=1", title: "Ask HN", description: "" },
        ];
      },
      hnItem: async () => ({
        title: "Ask HN",
        markdown: "# Ask HN\n\nhosting is pricey",
        publishedAt: null,
      }),
    };
    const hits = await fetch.searchForRun(
      meter,
      { query: "podcast hosting", site: "news.ycombinator.com" },
      15,
      {},
      hn,
    );
    assert.equal(hits.length, 1);
    assert.deepEqual(calls.search, [{ query: "podcast hosting", limit: 15, hn: true }]);
    const read = await fetch.getOrFetchSource(
      meter,
      request(`https://news.ycombinator.com/item?id=${process.pid}${Date.now()}`),
      hn,
    );
    assert.equal(read.source.site, "news.ycombinator.com");
    assert.deepEqual(calls.checks, []);
    assert.equal(spent, 0);
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
    await assert.rejects(fetch.searchForRun(meter, { query: "q" }, 15, {}, fakes()), /over budget/);
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

  it("waits and retries while Firecrawl rate limits, charging only the call that worked", async () => {
    const { FirecrawlError } = await import("@/lib/firecrawl.server.ts");
    const waits = [];
    let tries = 0;
    const flaky = {
      ...fakes(),
      sleep: async (ms) => {
        waits.push(ms);
      },
      search: async () => {
        tries++;
        if (tries === 1) throw new FirecrawlError("Firecrawl is rate limiting", 429, 7_000);
        if (tries === 2) throw new FirecrawlError("Firecrawl is rate limiting", 429);
        return { results: [{ url: "https://a.com", title: "A", description: "" }], credits: 2 };
      },
    };
    const results = await fetch.searchForRun(meter, { query: "q" }, 8, {}, flaky);
    assert.equal(results.length, 1);
    assert.deepEqual(waits, [7_000, 15_000], "Retry-After first, then the schedule");
    assert.equal(spent, 2);
  });

  it("gives up with Firecrawl's error after the last retry", async () => {
    const { FirecrawlError } = await import("@/lib/firecrawl.server.ts");
    const waits = [];
    const stuck = {
      ...fakes(),
      sleep: async (ms) => {
        waits.push(ms);
      },
      scrape: async () => {
        throw new FirecrawlError("Firecrawl is rate limiting — try again shortly.", 429);
      },
    };
    await assert.rejects(
      fetch.getOrFetchSource(meter, request("https://example.com/limited"), stuck),
      (err) => err.status === 429,
    );
    assert.equal(waits.length, 3);
    assert.equal(spent, 0);
  });

  it("checks a search against its most expensive outcome and charges the reported cost", async () => {
    const results = await fetch.searchForRun(
      meter,
      { query: "podcast editing frustrating" },
      15,
      {},
      fakes(),
    );
    assert.equal(results.length, 1);
    assert.deepEqual(calls.checks, [{ firecrawlCredits: 4 }]);
    assert.equal(spent, 2);
  });
});
