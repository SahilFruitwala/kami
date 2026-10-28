import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkPricing,
  fillSolutionsFromPlayers,
  freePlanOnPages,
  mergeExploreQueries,
  nameKey,
  pickHomepage,
  pricingPageUrl,
  requiredExploreQueries,
} from "../src/lib/research/players.ts";

describe("player name_key", () => {
  it("normalises case, punctuation, legal suffixes and extra spaces", () => {
    assert.equal(nameKey("Descript"), "descript");
    assert.equal(nameKey("  Descript, Inc.  "), "descript");
    assert.equal(nameKey("Descript LLC"), "descript");
    assert.equal(nameKey("Riverside.fm"), "riverside fm");
  });

  it("collapses two spellings of the same product to one key", () => {
    assert.equal(nameKey("Descript"), nameKey("descript"));
    assert.equal(nameKey("Descript Inc"), nameKey("Descript, Inc."));
  });
});

describe("homepage and pricing URLs", () => {
  it("picks a matching homepage and skips discussion sites", () => {
    const hits = [
      {
        url: "https://www.reddit.com/r/podcasting/comments/1/descript",
        title: "Descript is fine",
        description: "",
      },
      {
        url: "https://www.descript.com/",
        title: "Descript — AI video editor",
        description: "",
      },
      {
        url: "https://g2.com/products/descript",
        title: "Descript reviews",
        description: "",
      },
    ];
    assert.equal(pickHomepage(hits, "Descript"), "https://www.descript.com/");
    assert.equal(pickHomepage(hits, "NoSuchTool"), null);
  });

  it("builds a /pricing URL on the same origin", () => {
    assert.equal(pricingPageUrl("https://www.descript.com/"), "https://www.descript.com/pricing");
    assert.equal(
      pricingPageUrl("https://www.descript.com/pricing?ref=nav"),
      "https://www.descript.com/pricing?ref=nav",
    );
    assert.equal(pricingPageUrl("not a url"), null);
  });
});

describe("explore plan", () => {
  it("requires best / alternatives / directory searches", () => {
    const required = requiredExploreQueries("podcast editing");
    assert.equal(required.length, 3);
    assert.ok(required.some((q) => /best/.test(q.query)));
    assert.ok(required.some((q) => /alternatives/.test(q.query)));
    assert.ok(required.some((q) => /directory/.test(q.query)));

    const merged = mergeExploreQueries(
      [{ id: "q1", query: "podcast editing frustrating", intent: "pain", checked: true }],
      "podcast editing",
      "quick",
    );
    assert.ok(merged.some((q) => /best/.test(q.query)));
    assert.ok(merged.length <= 12);
  });
});

describe("Validate existing solutions from Players", () => {
  it("fills an empty solutions section from Players, citing their evidence", () => {
    const [solutions] = fillSolutionsFromPlayers(
      [{ id: "solutions", title: "Existing solutions", claims: [] }],
      [
        { name: "Descript", oneLiner: "AI video editor", evidenceIds: ["e1", "e1"] },
        { name: "Riverside", oneLiner: "", evidenceIds: [] },
      ],
    );
    assert.deepEqual(solutions.claims, [
      { text: "Descript: AI video editor", evidenceIds: ["e1"] },
      { text: "Riverside", evidenceIds: [], unsupported: true },
    ]);
  });

  it("leaves a non-empty solutions section alone", () => {
    const claim = { text: "People use Descript.", evidenceIds: ["e1"] };
    const [solutions] = fillSolutionsFromPlayers(
      [{ id: "solutions", title: "Existing solutions", claims: [claim] }],
      [{ name: "Riverside", oneLiner: "Studio", evidenceIds: ["e2"] }],
    );
    assert.deepEqual(solutions.claims, [claim]);
  });
});

describe("player pricing checks", () => {
  const page = "## Plans\n**Creator** $24/month, billed yearly.\nPro:  $40 / month";
  it("keeps only plans whose price is on a fetched page", () => {
    const { plans } = checkPricing(
      [
        { name: "Creator", price: "$24/month" },
        { name: "Pro", price: "$40 / month" },
        { name: "Team", price: "$99/month" },
        { name: "Enterprise", price: "" },
      ],
      [page],
    );
    assert.deepEqual(
      plans.map((p) => p.name),
      ["Creator", "Pro"],
    );
  });

  it("keeps a free plan only when a page says free", () => {
    assert.equal(freePlanOnPages(true, [page]), false);
    assert.equal(freePlanOnPages(true, [page, "Start free today"]), true);
    assert.equal(freePlanOnPages(false, ["Free forever"]), false);
  });
});
