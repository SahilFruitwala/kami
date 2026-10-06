import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MAX_AGE_MS,
  FirecrawlError,
  MAX_ANSWER_CHARS,
  buildQuestionBody,
  parseQuestionResponse,
  scrapeEndpoint,
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

describe("scrapeEndpoint", () => {
  it("defaults to the cloud API and honours a self-hosted base", () => {
    assert.equal(scrapeEndpoint(""), "https://api.firecrawl.dev/v2/scrape");
    assert.equal(scrapeEndpoint("http://firecrawl:3002/"), "http://firecrawl:3002/v2/scrape");
  });
});
