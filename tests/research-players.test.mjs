import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkPricing,
  groupPlayers,
  nameKey,
  pickHomepage,
  pricingUrl,
} from "../src/lib/research/players.ts";

describe("nameKey", () => {
  it("folds spellings of one product together", () => {
    for (const n of ["Notion", "notion", "Notion.so", "Notion Inc.", " NOTION "]) {
      assert.equal(nameKey(n), "notion", n);
    }
    assert.equal(nameKey("Café Tool"), "cafetool");
    assert.equal(nameKey("Monday.com"), "monday");
  });

  it("rejects names with too little left", () => {
    assert.equal(nameKey("a"), null);
    assert.equal(nameKey("..."), null);
    assert.equal(nameKey(".com"), null);
  });
});

describe("pickHomepage", () => {
  const hits = [
    { url: "https://www.g2.com/products/notion/reviews" },
    { url: "https://en.wikipedia.org/wiki/Notion" },
    { url: "https://www.notion.com/product?ref=x" },
  ];
  it("takes the first result on a host containing the name", () => {
    assert.equal(pickHomepage("Notion", hits), "https://www.notion.com");
  });
  it("returns null rather than guess", () => {
    assert.equal(pickHomepage("Obsidian", hits), null);
    assert.equal(pickHomepage("g", hits), null);
  });
  it("builds the pricing url", () => {
    assert.equal(pricingUrl("https://www.notion.com/"), "https://www.notion.com/pricing");
  });
});

describe("checkPricing", () => {
  const page =
    "Free forever. Plus $12 per seat per month. Business $18 per seat. Enterprise: contact us.";
  it("keeps only plans whose price is on the page", () => {
    const plans = checkPricing(
      [
        { name: "Free", price: "Free" },
        { name: "Plus", price: "$12/mo" },
        { name: "Pro", price: "$99" },
        { name: "Enterprise", price: "" },
        { name: "", price: "$18" },
      ],
      page,
    );
    assert.deepEqual(
      plans.map((p) => p.name),
      ["Free", "Plus"],
    );
  });
  it("drops a free plan the page never mentions", () => {
    assert.deepEqual(checkPricing([{ name: "Free", price: "Free" }], "Plus $12"), []);
  });
});

describe("groupPlayers", () => {
  const p = (name, category, mentions, complaints = 0, freePlan = null) => ({
    name,
    category,
    mentions,
    complaints,
    freePlan,
  });
  it("groups by category and sorts inside each group", () => {
    const groups = groupPlayers(
      [p("B", "Editors", 1), p("A", "Editors", 5), p("C", null, 9), p("D", "Hosting", 2)],
      "mentions",
    );
    assert.deepEqual(
      groups.map((g) => g.category),
      ["Editors", "Hosting", "Uncategorised"],
    );
    assert.deepEqual(
      groups[0].players.map((x) => x.name),
      ["A", "B"],
    );
  });
  it("sorts by name and by free plan", () => {
    const list = [p("Z", "X", 1, 0, false), p("A", "X", 1, 0, true)];
    assert.equal(groupPlayers(list, "name")[0].players[0].name, "A");
    assert.equal(groupPlayers(list, "free")[0].players[0].name, "A");
  });
});
