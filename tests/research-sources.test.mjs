import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SOURCE_FRESH_DAYS,
  chunkMarkdown,
  inferSourceKind,
  isReadableUrl,
  isSourceFresh,
  siteOf,
  trimPageMarkdown,
  urlKey,
} from "../src/lib/research/sources.ts";

describe("urlKey", () => {
  it("folds every Reddit host and drops the thread slug and case", () => {
    const key = "reddit.com/r/podcasting/comments/1abc";
    for (const url of [
      "https://www.reddit.com/r/podcasting/comments/1abc/editing_takes_forever/",
      "https://old.reddit.com/r/Podcasting/comments/1ABC/",
      "https://np.reddit.com/r/podcasting/comments/1abc/x/?utm_source=share",
      "http://reddit.com/r/podcasting/comments/1abc#comments",
    ]) {
      assert.equal(urlKey(url), key, url);
    }
  });

  it("drops www., fragments, trailing slashes and tracking params; sorts the rest", () => {
    assert.equal(
      urlKey("https://www.example.com/a/b/?b=2&utm_medium=x&a=1&fbclid=z&ref=hn#top"),
      "example.com/a/b?a=1&b=2",
    );
    assert.equal(urlKey("https://example.com/"), "example.com");
    assert.equal(
      urlKey("https://news.ycombinator.com/item?id=123"),
      "news.ycombinator.com/item?id=123",
    );
  });

  it("keeps path case outside Reddit", () => {
    assert.equal(urlKey("https://github.com/Owner/Repo"), "github.com/Owner/Repo");
  });

  it("refuses anything that isn't http(s)", () => {
    assert.equal(urlKey("ftp://example.com/x"), null);
    assert.equal(urlKey("not a url"), null);
    assert.equal(siteOf("javascript:alert(1)"), null);
  });
});

describe("inferSourceKind", () => {
  const cases = [
    ["https://www.reddit.com/r/podcasting/comments/1abc/slug/", "thread"],
    ["https://news.ycombinator.com/item?id=1", "thread"],
    ["https://forum.example.com/t/editing-is-slow/123", "thread"],
    ["https://github.com/a/b/issues/12", "thread"],
    ["https://www.g2.com/products/descript/reviews", "review"],
    ["https://www.capterra.com/p/123/Descript/reviews/", "review"],
    ["https://www.trustpilot.com/review/descript.com", "review"],
    ["https://apps.apple.com/us/app/descript/id123", "review"],
    ["https://descript.com/pricing", "pricing"],
    ["https://www.riverside.fm/", "homepage"],
    ["https://someone.substack.com/p/why-editing", "article"],
    ["https://example.com/blog/editing-tips", "article"],
    ["https://example.com/about", "other"],
    ["https://www.reddit.com/r/podcasting/", "other"],
  ];
  for (const [url, kind] of cases) {
    it(`${url} → ${kind}`, () => assert.equal(inferSourceKind(url), kind));
  }
});

describe("isReadableUrl", () => {
  it("skips PDFs and other files", () => {
    assert.equal(isReadableUrl("https://example.com/report.pdf"), false);
    assert.equal(isReadableUrl("https://example.com/x.PNG"), false);
    assert.equal(isReadableUrl("https://example.com/pdf-tools"), true);
    assert.equal(isReadableUrl("mailto:a@b.c"), false);
  });
});

describe("isSourceFresh", () => {
  const day = 86_400_000;
  const now = 100 * day;
  it("keeps each kind fresh for its own number of days", () => {
    assert.equal(isSourceFresh(now - 29 * day, "thread", now), true);
    assert.equal(isSourceFresh(now - 30 * day, "thread", now), false);
    assert.equal(isSourceFresh(new Date(now - 6 * day), "pricing", now), true);
    assert.equal(isSourceFresh(now - 7 * day, "pricing", now), false);
    assert.equal(isSourceFresh(now - 89 * day, "article", now), true);
    assert.equal(SOURCE_FRESH_DAYS.homepage, 7);
  });
});

describe("trimPageMarkdown", () => {
  it("drops menus, images and furniture, keeps what people wrote", () => {
    const page = [
      "[Home](/)",
      "[Pricing](/pricing)",
      "- [Blog](/blog)",
      "- [Docs](/docs)",
      "",
      "![logo](/logo.png)",
      "We use cookies to improve your experience.",
      "Accept all cookies",
      "",
      "## Editing takes forever",
      "",
      "I spend **four hours** editing every episode. See [this thread](https://x.com/t) for more.",
      "",
      "Reply",
      "Share",
      "",
      "",
      "",
      "Anyone found a [tool](https://t.co/x) that removes filler words well?",
      "",
      "Privacy Policy",
    ].join("\n");
    assert.equal(
      trimPageMarkdown(page),
      [
        "## Editing takes forever",
        "",
        "I spend **four hours** editing every episode. See this thread for more.",
        "",
        "Anyone found a tool that removes filler words well?",
      ].join("\n"),
    );
  });

  it("keeps a single link line, which can be content", () => {
    assert.equal(
      trimPageMarkdown("Here it is:\n[the doc](https://a.b)\nThanks"),
      "Here it is:\nthe doc\nThanks",
    );
  });

  it("keeps long lines that merely mention a boilerplate word", () => {
    const line = "I had to sign up for three tools before one of them actually removed the ums.";
    assert.equal(trimPageMarkdown(line), line);
  });
});

describe("chunkMarkdown", () => {
  it("packs whole paragraphs up to the limit", () => {
    const md = ["aaaa", "bbbb", "cccc", "dddd"].join("\n\n");
    assert.deepEqual(chunkMarkdown(md, 10), ["aaaa\n\nbbbb", "cccc\n\ndddd"]);
  });

  it("splits an overlong paragraph at sentence ends, then hard", () => {
    const md = "One two. Three four. Five six.";
    assert.deepEqual(chunkMarkdown(md, 12), ["One two.", "Three four.", "Five six."]);
    assert.deepEqual(chunkMarkdown("x".repeat(25), 10), [
      "x".repeat(10),
      "x".repeat(10),
      "x".repeat(5),
    ]);
  });

  it("never returns empty chunks", () => {
    assert.deepEqual(chunkMarkdown("\n\n\n", 10), []);
  });
});
