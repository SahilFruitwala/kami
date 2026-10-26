import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEPTH_LIMITS,
  normalizeQuery,
  normalizeSite,
  screenResults,
  scoreResult,
  searchText,
  validatePlan,
} from "../src/lib/research/discover.ts";

const input = { seed: "tools for indie podcasters" };

describe("validatePlan", () => {
  it("trims queries, normalises sites and moves an inline site: into the site", () => {
    const [a, b] = validatePlan(
      [
        { query: "  podcast   editing  frustrating ", site: "https://www.Reddit.com/r/podcasting" },
        { query: "riverside alternative site:news.ycombinator.com", intent: "alternatives" },
      ],
      input,
      "quick",
      new Set(),
      "draft",
    );
    assert.deepEqual(a, {
      id: "q1",
      query: "podcast editing frustrating",
      site: "reddit.com",
      intent: "pain",
      checked: true,
    });
    assert.equal(b.query, "riverside alternative");
    assert.equal(b.site, "news.ycombinator.com");
    assert.equal(b.intent, "alternatives");
    assert.equal(searchText(b), "riverside alternative site:news.ycombinator.com");
  });

  it("drops empty queries, duplicates and excluded sites, and honours include-only", () => {
    const plan = [
      { query: "" },
      { query: "editing slow", site: "reddit.com" },
      { query: "Editing  SLOW", site: "old.reddit.com" },
      { query: "editing slow", site: "g2.com" },
      { query: "editing slow", site: "quora.com" },
      { query: "editing slow" },
    ];
    const out = validatePlan(
      plan,
      { ...input, excludeSites: ["quora.com"], includeSites: ["reddit.com", "g2.com"] },
      "quick",
      new Set(),
      "draft",
    );
    assert.deepEqual(
      out.map((q) => searchText(q)),
      ["editing slow site:reddit.com", "editing slow site:g2.com", "editing slow"],
    );
  });

  it("caps the plan at the depth's query limit", () => {
    const plan = Array.from({ length: 40 }, (_, i) => ({ query: `query ${i}` }));
    assert.equal(
      validatePlan(plan, input, "quick", new Set(), "draft").length,
      DEPTH_LIMITS.quick.maxQueries,
    );
    assert.equal(
      validatePlan(plan, input, "deep", new Set(), "draft").length,
      DEPTH_LIMITS.deep.maxQueries,
    );
  });

  it("flags queries the topic already sent: unchecked in a draft, the user's call once edited", () => {
    const sent = new Set([normalizeQuery("podcast editing site:reddit.com")]);
    const plan = [
      { query: "Podcast Editing", site: "reddit.com", checked: true },
      { query: "new one" },
    ];
    const [repeat, fresh] = validatePlan(plan, input, "quick", sent, "draft");
    assert.equal(repeat.repeat, true);
    assert.equal(repeat.checked, false);
    assert.equal(fresh.checked, true);
    assert.equal(fresh.repeat, undefined);
    const [edited] = validatePlan(plan, input, "quick", sent, "edited");
    assert.equal(edited.checked, true);
    assert.equal(edited.repeat, true);
  });

  it("refuses sites that aren't hosts", () => {
    assert.equal(normalizeSite("not a site"), null);
    assert.equal(normalizeSite("G2.com"), "g2.com");
  });
});

describe("screenResults", () => {
  const hit = (url, title = "A page", description = "") => ({ url, title, description });

  it("drops files, video and login-walled sites, excluded sites, duplicates and known pages", () => {
    const hits = [
      hit("https://www.reddit.com/r/podcasting/comments/abc/slug/"),
      hit("https://old.reddit.com/r/podcasting/comments/abc/"),
      hit("https://example.com/report.pdf"),
      hit("https://www.youtube.com/watch?v=1"),
      hit("https://www.quora.com/How-do-you-edit"),
      hit("https://known.example.com/thread"),
      hit("https://forum.example.com/t/editing/1"),
    ];
    const { candidates, distinct } = screenResults(hits, {
      excludeSites: ["quora.com"],
      topicKeys: new Set(["known.example.com/thread"]),
      maxCandidates: 10,
    });
    assert.deepEqual(
      candidates.map((c) => c.urlKey),
      ["reddit.com/r/podcasting/comments/abc", "forum.example.com/t/editing/1"],
    );
    assert.equal(distinct, 6);
  });

  it("ranks discussions about pain above listicles, keeps search order on ties, and caps", () => {
    const listicle = hit("https://blog.example.com/blog/x", "Top 10 best podcast editors");
    const thread = hit(
      "https://www.reddit.com/r/podcasting/comments/z/",
      "Is there a tool that doesn't make editing so frustrating?",
      "I hate spending hours editing",
    );
    const plainA = hit("https://a.example.com/one", "Podcast editing");
    const plainB = hit("https://b.example.com/two", "Podcast editing");
    assert.ok(scoreResult(thread) > scoreResult(plainA));
    assert.ok(scoreResult(plainA) > scoreResult(listicle));
    const { candidates } = screenResults([listicle, plainA, plainB, thread], {
      topicKeys: new Set(),
      maxCandidates: 3,
    });
    assert.deepEqual(
      candidates.map((c) => c.url),
      [thread.url, plainA.url, plainB.url],
    );
  });
});
