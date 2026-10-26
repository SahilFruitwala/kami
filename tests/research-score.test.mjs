import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SCORE_WEIGHTS,
  competitionLabel,
  frequencyScore,
  intensityScore,
  paysScore,
  recencyScore,
  scoreIdea,
  spreadScore,
} from "../src/lib/research/score.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 26);
const e = (over = {}) => ({
  authorKey: null,
  site: "reddit.com",
  sourceId: "s1",
  sentiment: 0,
  strong: false,
  pays: false,
  names: [],
  postedAt: null,
  ...over,
});

describe("idea sub-scores", () => {
  it("frequency counts people, anonymous quotes as half, on a log scale to 30", () => {
    assert.equal(frequencyScore([]), 0);
    const one = frequencyScore([e({ authorKey: "a" }), e({ authorKey: "a" })]);
    assert.equal(one, Math.log2(2) / Math.log2(31));
    assert.equal(frequencyScore([e(), e()]), one, "two anonymous quotes = one person");
    const many = Array.from({ length: 40 }, (_, i) => e({ authorKey: `p${i}` }));
    assert.equal(frequencyScore(many), 1);
  });

  it("spread weighs different sites over different pages", () => {
    assert.equal(spreadScore([]), 0);
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
    near(spreadScore([e()]), 0.04);
    const fiveSites = ["a", "b", "c", "d", "e"].map((s, i) => e({ site: s, sourceId: `s${i}` }));
    near(spreadScore(fiveSites), 0.8);
  });

  it("intensity is the share of strongly felt or very negative quotes", () => {
    assert.equal(intensityScore([e({ strong: true }), e({ sentiment: -2 }), e(), e()]), 0.5);
    assert.equal(intensityScore([]), 0);
  });

  it("willingness to pay tops out at five quotes", () => {
    assert.equal(paysScore([e({ pays: true }), e()]), 0.2);
    assert.equal(paysScore(Array.from({ length: 8 }, () => e({ pays: true }))), 1);
  });

  it("recency halves every 180 days, and is neutral when nothing is dated", () => {
    assert.equal(recencyScore([e()], NOW), 0.5);
    assert.equal(recencyScore([e({ postedAt: new Date(NOW) })], NOW), 1);
    assert.equal(recencyScore([e({ postedAt: new Date(NOW - 180 * DAY) })], NOW), 0.5);
    assert.equal(
      recencyScore(
        [e({ postedAt: new Date(NOW) }), e({ postedAt: new Date(NOW - 360 * DAY) })],
        NOW,
      ),
      (1 + 0.25) / 2,
    );
  });
});

describe("competition label", () => {
  it("reads named products: none, some, crowded, crowded but disliked", () => {
    assert.equal(competitionLabel([e()]), "none");
    assert.equal(competitionLabel([e({ names: ["Descript", "descript"] })]), "some");
    const three = [e({ names: ["A", "B"] }), e({ names: ["C"], sentiment: 1 })];
    assert.equal(competitionLabel(three), "crowded");
    const disliked = [e({ names: ["A", "B"], sentiment: -1 }), e({ names: ["C"], sentiment: 1 })];
    assert.equal(competitionLabel(disliked), "crowded_disliked");
  });
});

describe("scoreIdea", () => {
  it("totals the weighted sub-scores and leaves competition out of the total", () => {
    const evidence = [
      e({ authorKey: "a", strong: true, pays: true, postedAt: new Date(NOW), names: ["X"] }),
      e({ authorKey: "b", site: "news.ycombinator.com", sourceId: "s2", sentiment: -2 }),
    ];
    const s = scoreIdea(evidence, NOW);
    const expected =
      SCORE_WEIGHTS.frequency * s.frequency +
      SCORE_WEIGHTS.spread * s.spread +
      SCORE_WEIGHTS.intensity * s.intensity +
      SCORE_WEIGHTS.pays * s.pays +
      SCORE_WEIGHTS.recency * s.recency;
    assert.equal(s.total, Math.round(expected * 1000) / 1000);
    assert.equal(s.intensity, 1);
    assert.equal(s.competition, "some");
    assert.deepEqual(scoreIdea(evidence, NOW), s, "same evidence, same score");
  });

  it("weights add up to 1", () => {
    const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(Math.round(sum * 1000) / 1000, 1);
  });
});
