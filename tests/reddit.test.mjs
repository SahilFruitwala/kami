import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRedditThread, redditThreadJsonUrl } from "../src/lib/reddit.server.ts";
import { verifyQuote } from "../src/lib/research/verify.ts";

const comment = (data, replies = "") => ({ kind: "t1", data: { ...data, replies } });
const listing = (children) => ({ kind: "Listing", data: { children } });

const payload = [
  listing([
    {
      kind: "t3",
      data: {
        title: "Audio editing sucks",
        author: "podguy",
        created_utc: 1735776000,
        selftext: "I spend **four hours** editing every episode.",
      },
    },
  ]),
  listing([
    comment(
      {
        author: "a",
        created_utc: 1735862400,
        score: 40,
        body: "Descript keeps crashing on long recordings, so I switched to Audacity.",
      },
      listing([
        comment({
          author: "b",
          created_utc: 1735948800,
          score: 3,
          body: "Same here, it's so frustrating.",
        }),
        comment({ author: "[deleted]", body: "[removed]" }),
      ]),
    ),
    { kind: "more", data: { count: 12 } },
  ]),
];

describe("redditThreadJsonUrl", () => {
  it("turns any thread URL into its .json address", () => {
    for (const url of [
      "https://www.reddit.com/r/podcasting/comments/l88su8/audio_editing_sucks/",
      "https://old.reddit.com/r/podcasting/comments/l88su8/",
      "https://reddit.com/r/podcasting/comments/l88su8/x/?utm_source=share",
    ]) {
      assert.match(
        redditThreadJsonUrl(url),
        /^https:\/\/www\.reddit\.com\/r\/podcasting\/comments\/l88su8\.json\?raw_json=1&sort=top/,
      );
    }
  });

  it("refuses pages that aren't threads", () => {
    assert.equal(redditThreadJsonUrl("https://www.reddit.com/r/podcasting/"), null);
    assert.equal(redditThreadJsonUrl("https://example.com/r/x/comments/1/"), null);
    assert.equal(redditThreadJsonUrl("not a url"), null);
  });
});

describe("parseRedditThread", () => {
  const page = parseRedditThread(payload);

  it("keeps the post and every live comment, with author, date and score", () => {
    assert.equal(page.title, "Audio editing sucks");
    assert.equal(page.publishedAt.toISOString(), "2025-01-02T00:00:00.000Z");
    assert.match(page.markdown, /^# Audio editing sucks/);
    assert.match(page.markdown, /u\/podguy · 2025-01-02\n\nI spend \*\*four hours\*\* editing/);
    assert.match(page.markdown, /\*\*u\/a\*\* · 2025-01-03 · 40 points\n\nDescript keeps crashing/);
    assert.match(page.markdown, /\*\*u\/b\*\* · 2025-01-04 · 3 points · reply\n\nSame here/);
    assert.ok(!page.markdown.includes("[removed]"), "removed comments are left out");
  });

  it("produces text that quotes verify against", () => {
    assert.equal(
      verifyQuote(
        "Descript keeps crashing on long recordings, so I switched to Audacity.",
        page.markdown,
      )?.match,
      "exact",
    );
    assert.equal(
      verifyQuote("I spend four hours editing every episode.", page.markdown)?.match,
      "exact",
    );
  });

  it("refuses anything that isn't a thread", () => {
    assert.throws(() => parseRedditThread({ error: 404 }), /didn't return a thread/);
    assert.throws(() => parseRedditThread([listing([]), listing([])]), /didn't return a thread/);
  });
});
