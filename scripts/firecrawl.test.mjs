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
