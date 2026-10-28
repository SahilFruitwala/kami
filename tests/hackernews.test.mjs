import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildHnSearchUrl,
  hnHtmlToText,
  hnItemJsonUrl,
  parseHnItem,
  parseHnSearch,
} from "../src/lib/hackernews.server.ts";
import { verifyQuote } from "../src/lib/research/verify.ts";

describe("Hacker News search", () => {
  it("searches stories and comments, optionally within a time window", () => {
    const url = new URL(buildHnSearchUrl("podcast hosting", 15));
    assert.equal(url.origin + url.pathname, "https://hn.algolia.com/api/v1/search");
    assert.equal(url.searchParams.get("query"), "podcast hosting");
    assert.equal(url.searchParams.get("tags"), "(story,comment)");
    assert.equal(url.searchParams.get("hitsPerPage"), "15");
    const since = new URL(
      buildHnSearchUrl("x", 5, { sinceMonths: 12, now: new Date("2026-10-26T00:00:00Z") }),
    );
    assert.equal(since.searchParams.get("numericFilters"), "created_at_i>1761436800");
  });

  it("returns one hit per discussion, with the matching comment as the snippet", () => {
    const hits = parseHnSearch(
      {
        hits: [
          {
            objectID: "100",
            story_id: 7,
            story_title: "Ask HN: Podcast hosting?",
            comment_text: "Libsyn got <i>so</i> expensive &amp; slow",
          },
          { objectID: "7", title: "Ask HN: Podcast hosting?", story_text: "Which host?" },
          { objectID: "9", title: "Show HN: Cast", story_text: null },
        ],
      },
      10,
    );
    assert.deepEqual(hits, [
      {
        url: "https://news.ycombinator.com/item?id=7",
        title: "Ask HN: Podcast hosting?",
        description: "Libsyn got so expensive & slow",
      },
      { url: "https://news.ycombinator.com/item?id=9", title: "Show HN: Cast", description: "" },
    ]);
    assert.throws(() => parseHnSearch({}, 5), /nothing readable/);
  });
});

describe("Hacker News discussions", () => {
  it("knows discussion URLs", () => {
    assert.equal(
      hnItemJsonUrl("https://news.ycombinator.com/item?id=42"),
      "https://hn.algolia.com/api/v1/items/42",
    );
    assert.equal(hnItemJsonUrl("https://news.ycombinator.com/news"), null);
    assert.equal(hnItemJsonUrl("https://example.com/item?id=42"), null);
  });

  it("turns a comment tree into text quotes verify against", () => {
    const page = parseHnItem({
      title: "Ask HN: What do you pay for podcast hosting?",
      author: "pg",
      created_at: "2025-02-01T10:00:00.000Z",
      text: "<p>Curious what people pay.",
      children: [
        {
          author: "alice",
          created_at: "2025-02-01T11:00:00.000Z",
          text: "Libsyn charges me &#x27;$20 a month&#x27; for what&#x27;s basically an RSS file.<p>It&#x27;s absurd.",
          children: [
            { author: "bob", created_at: "2025-02-02T00:00:00Z", text: "Agreed.", children: [] },
          ],
        },
        { author: null, text: null, children: [] },
      ],
    });
    assert.equal(page.title, "Ask HN: What do you pay for podcast hosting?");
    assert.equal(page.publishedAt.toISOString(), "2025-02-01T10:00:00.000Z");
    assert.match(page.markdown, /\*\*alice\*\* · 2025-02-01\n\nLibsyn charges me '\$20 a month'/);
    assert.match(page.markdown, /\*\*bob\*\* · 2025-02-02 · reply\n\nAgreed\./);
    assert.equal(
      verifyQuote(
        "Libsyn charges me '$20 a month' for what's basically an RSS file.",
        page.markdown,
      )?.match,
      "exact",
    );
  });

  it("reads HN's HTML as plain text", () => {
    assert.equal(
      hnHtmlToText(
        'See <a href="https://x.y" rel="nofollow">this</a><p>&quot;two&quot; &gt; one &amp; <i>more</i>',
      ),
      'See this\n\n"two" > one & more',
    );
  });
});
