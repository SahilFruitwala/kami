import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateRun, searchCreditCost } from "../src/lib/research/estimate.ts";

const q = (id, over = {}) => ({ id, query: id, intent: "pain", checked: true, ...over });

describe("estimateRun", () => {
  it("counts paid searches, pages and tokens; Hacker News and unchecked searches are free", () => {
    const plan = [q("a"), q("b", { site: "news.ycombinator.com" }), q("c", { checked: false })];
    // 1 paid search (2) + 12 pages (6–12) + tokens (2–6).
    assert.deepEqual(estimateRun(plan, "quick"), { low: 10, high: 20, budget: 45 });
  });

  it("drops by a search's cost when one is unchecked", () => {
    const plan = [q("a"), q("b"), q("c")];
    const before = estimateRun(plan, "quick");
    const after = estimateRun([q("a"), q("b"), q("c", { checked: false })], "quick");
    assert.equal(before.high - after.high, searchCreditCost(10));
  });

  it("counts a search the topic already sent as free at the low end only", () => {
    const fresh = estimateRun([q("a")], "quick");
    const repeat = estimateRun([q("a", { repeat: true })], "quick");
    assert.equal(fresh.low - repeat.low, 2);
    assert.equal(fresh.high, repeat.high);
  });

  it("never goes above the depth's budget", () => {
    const big = Array.from({ length: 20 }, (_, i) => q(`q${i}`));
    assert.deepEqual(estimateRun(big, "deep"), { low: 65, high: 92, budget: 100 });
    const huge = Array.from({ length: 60 }, (_, i) => q(`q${i}`));
    assert.equal(estimateRun(huge, "deep").high, 100);
  });
  it("adds Map a space's Player fills to the budget and the range", () => {
    const plan = [q("a"), q("b")];
    const discover = estimateRun(plan, "quick");
    const explore = estimateRun(plan, "quick", "explore");
    assert.equal(explore.budget, discover.budget + 32);
    assert.equal(explore.high, discover.high + 32);
    assert.equal(explore.low, discover.low + 16);
  });
});
