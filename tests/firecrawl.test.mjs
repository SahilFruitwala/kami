import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MAX_AGE_MS,
  FirecrawlError,
  MAX_ANSWER_CHARS,
  MAX_PAGE_CHARS,
  MAX_SEARCH_RESULTS,
  buildQuestionBody,
  buildReadBody,
  buildSearchBody,
  parseQuestionResponse,
  parseReadResponse,
  parseSearchResponse,
} from "../src/lib/firecrawl.server.ts";

describe("buildQuestionBody", () => {
  it("asks one question about main content with the default cache age", () => {
    assert.deepEqual(
      buildQuestionBody({ url: "https://www.producthunt.com/", question: "Latest products?" }),
      {
        url: "https://www.producthunt.com/",
        onlyMainContent: true,
        maxAge: DEFAULT_MAX_AGE_MS,
        parsers: ["pdf"],
        formats: [{ type: "question", question: "Latest products?" }],
      },
    );
  });

  it("passes maxAge 0 through for a live fetch", () => {
    assert.equal(buildQuestionBody({ url: "https://a.com", question: "q", maxAge: 0 }).maxAge, 0);
  });
});

describe("parseQuestionResponse", () => {
  it("reads data.question as a string", () => {
    const md = "| Name | Link |\n|---|---|\n| Foo | https://foo.dev |";
    assert.equal(parseQuestionResponse({ success: true, data: { question: `  ${md}\n` } }), md);
  });

  it("accepts { answer } objects and a top-level answer", () => {
    assert.equal(parseQuestionResponse({ data: { question: { answer: "A" } } }), "A");
    assert.equal(parseQuestionResponse({ data: { answer: "B" } }), "B");
  });

  it("caps very long answers", () => {
    const long = "x".repeat(MAX_ANSWER_CHARS + 10);
    assert.equal(parseQuestionResponse({ data: { question: long } }).length, MAX_ANSWER_CHARS);
  });

  it("surfaces upstream errors and empty answers", () => {
    assert.throws(
      () => parseQuestionResponse({ success: false, error: "Blocked by robots.txt" }),
      (err) => err instanceof FirecrawlError && err.message === "Blocked by robots.txt",
    );
    assert.throws(
      () => parseQuestionResponse({ success: true, data: { question: "  " } }),
      FirecrawlError,
    );
    assert.throws(() => parseQuestionResponse(null), FirecrawlError);
  });
});

describe("web search", () => {
  it("builds a web-only search with a clamped limit", () => {
    assert.deepEqual(buildSearchBody("cafés Lisbon"), {
      query: "cafés Lisbon",
      limit: 5,
      sources: ["web"],
    });
    assert.equal(buildSearchBody("x", 50).limit, MAX_SEARCH_RESULTS);
    assert.equal(buildSearchBody("x", 0).limit, 1);
  });

  it("reads v2 { data: { web } } and flat { data: [] } results, skipping bad URLs", () => {
    const entry = { title: "Best cafés", url: "https://example.com/cafes", description: "A list" };
    assert.deepEqual(parseSearchResponse({ success: true, data: { web: [entry] } }), [entry]);
    assert.deepEqual(
      parseSearchResponse({
        success: true,
        data: [entry, { url: "javascript:alert(1)" }, { title: "no url" }, null],
      }),
      [entry],
    );
    assert.deepEqual(parseSearchResponse({ success: true, data: {} }), []);
  });

  it("surfaces upstream search errors", () => {
    assert.throws(
      () => parseSearchResponse({ success: false, error: "Bad query" }),
      (err) => err instanceof FirecrawlError && err.message === "Bad query",
    );
  });
});

describe("page reading", () => {
  it("asks for cached main-content Markdown", () => {
    assert.deepEqual(buildReadBody("https://example.com/"), {
      url: "https://example.com/",
      onlyMainContent: true,
      maxAge: DEFAULT_MAX_AGE_MS,
      parsers: ["pdf"],
      formats: ["markdown"],
    });
  });

  it("caps long pages and flags the cut", () => {
    const long = "a".repeat(MAX_PAGE_CHARS + 10);
    const read = parseReadResponse({ success: true, data: { markdown: long } });
    assert.equal(read.markdown.length, MAX_PAGE_CHARS);
    assert.equal(read.truncated, true);
    assert.deepEqual(parseReadResponse({ success: true, data: { markdown: " # Hi " } }), {
      markdown: "# Hi",
      truncated: false,
    });
  });

  it("rejects empty pages", () => {
    assert.throws(() => parseReadResponse({ success: true, data: {} }), FirecrawlError);
  });
});

describe("research search and scrape", () => {
  it("prices searches at 2 credits per 10 results, rounded up", async () => {
    const { searchCreditCost } = await import("../src/lib/firecrawl.server.ts");
    assert.equal(searchCreditCost(0), 0);
    assert.equal(searchCreditCost(1), 2);
    assert.equal(searchCreditCost(10), 2);
    assert.equal(searchCreditCost(11), 4);
    assert.equal(searchCreditCost(20), 4);
  });

  it("caps research results at 20 and adds a date window when asked", async () => {
    const { buildResearchSearchBody } = await import("../src/lib/firecrawl.server.ts");
    assert.deepEqual(buildResearchSearchBody("q", 50), { query: "q", limit: 20, sources: ["web"] });
    assert.deepEqual(
      buildResearchSearchBody("q", 15, { sinceMonths: 12, now: new Date("2026-10-26T12:00:00Z") }),
      { query: "q", limit: 15, sources: ["web"], tbs: "cdr:1,cd_min:10/26/2025" },
    );
  });

  it("keeps more than the trip agent's 8 results when asked", async () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({
      url: `https://a.com/${i}`,
      title: "t",
    }));
    assert.equal(parseSearchResponse({ success: true, data: { web: entries } }).length, 8);
    assert.equal(parseSearchResponse({ success: true, data: { web: entries } }, 20).length, 12);
  });

  it("reads Firecrawl's own credit count from search and scrape responses", async () => {
    const { parseCreditsUsed } = await import("../src/lib/firecrawl.server.ts");
    assert.equal(parseCreditsUsed({ creditsUsed: 4 }), 4);
    assert.equal(parseCreditsUsed({ data: { metadata: { creditsUsed: 1 } } }), 1);
    assert.equal(parseCreditsUsed({ data: {} }), null);
    assert.equal(parseCreditsUsed(null), null);
  });

  it("scrapes main content as Markdown without the per-page PDF parser", async () => {
    const { buildResearchScrapeBody } = await import("../src/lib/firecrawl.server.ts");
    assert.deepEqual(buildResearchScrapeBody("https://a.com"), {
      url: "https://a.com",
      onlyMainContent: true,
      maxAge: DEFAULT_MAX_AGE_MS,
      parsers: [],
      formats: ["markdown"],
    });
  });

  it("parses a scrape into text, title, date and cost", async () => {
    const { parseResearchScrapeResponse } = await import("../src/lib/firecrawl.server.ts");
    const page = parseResearchScrapeResponse({
      success: true,
      data: {
        markdown: "Hello",
        metadata: { title: " A thread ", publishedTime: "2026-01-02T00:00:00Z", creditsUsed: 1 },
      },
    });
    assert.equal(page.markdown, "Hello");
    assert.equal(page.title, "A thread");
    assert.equal(page.publishedAt?.toISOString(), "2026-01-02T00:00:00.000Z");
    assert.equal(page.credits, 1);
    const bare = parseResearchScrapeResponse({ success: true, data: { markdown: "x" } });
    assert.equal(bare.credits, 1);
    assert.equal(bare.publishedAt, null);
    assert.throws(
      () => parseResearchScrapeResponse({ success: true, data: { markdown: " " } }),
      FirecrawlError,
    );
  });
});

describe("Firecrawl refusals", () => {
  const answer = (status, body) => async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("tells a refused site (403) apart from a rejected key (401)", async () => {
    const { researchScrape } = await import("../src/lib/firecrawl.server.ts");
    const realFetch = globalThis.fetch;
    const key = process.env.FIRECRAWL_API_KEY;
    process.env.FIRECRAWL_API_KEY = "fc-test";
    try {
      globalThis.fetch = answer(403, { success: false, error: "we do not support this site" });
      await assert.rejects(researchScrape("https://www.reddit.com/r/x/comments/1/"), (err) => {
        assert.ok(err instanceof FirecrawlError);
        assert.equal(err.status, 422);
        assert.equal(err.message, "Firecrawl can't read pages on this site.");
        return true;
      });
      globalThis.fetch = answer(401, { success: false, error: "Unauthorized" });
      await assert.rejects(researchScrape("https://a.com"), /rejected the server's API key/);
    } finally {
      globalThis.fetch = realFetch;
      if (key === undefined) delete process.env.FIRECRAWL_API_KEY;
      else process.env.FIRECRAWL_API_KEY = key;
    }
  });
});
