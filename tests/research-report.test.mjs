import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VALIDATE_SECTIONS,
  citedEvidenceIds,
  counterQueryCount,
  fallbackReport,
  resolveReport,
  unsupportedCount,
} from "../src/lib/research/report.ts";

const labels = new Map([
  ["E1", "ev-1"],
  ["E2", "ev-2"],
  ["E3", "ev-3"],
]);
const valid = new Set(["ev-1", "ev-2", "ev-3"]);
const base = {
  labels,
  valid,
  searched: ["why I stopped using x", "x too small"],
  fixed: VALIDATE_SECTIONS,
};

describe("resolveReport (validate)", () => {
  it("resolves labels, drops unknown ones and marks uncited claims unsupported", () => {
    const body = resolveReport(
      [
        {
          id: "problem",
          claims: [
            { text: "People lose hours editing.", evidence: ["E1", "[e2]", "3"] },
            { text: "Everyone hates it.", evidence: ["E9"] },
            { text: "Made up.", evidence: [] },
          ],
        },
      ],
      base,
    );
    const problem = body.sections.find((s) => s.id === "problem");
    assert.deepEqual(problem.claims[0].evidenceIds, ["ev-1", "ev-2", "ev-3"]);
    assert.equal(problem.claims[1].unsupported, true);
    assert.equal(problem.claims[2].unsupported, true);
    assert.equal(unsupportedCount(body), 2);
  });

  it("always has every fixed section, in order", () => {
    const body = resolveReport([], base);
    assert.deepEqual(
      body.sections.map((s) => s.id),
      VALIDATE_SECTIONS.map((s) => s.id),
    );
  });

  it("never leaves counter-evidence empty and says what was searched", () => {
    const body = resolveReport(
      [{ id: "counter", claims: [{ text: "Probably fine.", evidence: [] }] }],
      base,
    );
    const counter = body.sections.find((s) => s.id === "counter");
    assert.ok(counter.claims.some((c) => c.note && /why I stopped using x/.test(c.text)));
    const withEvidence = resolveReport(
      [{ id: "counter", claims: [{ text: "Free tool is good enough.", evidence: ["E2"] }] }],
      base,
    );
    assert.ok(!withEvidence.sections.find((s) => s.id === "counter").claims.some((c) => c.note));
  });

  it("drops empty claims, dedupes ids and caps claims per section", () => {
    const claims = Array.from({ length: 12 }, (_, i) => ({
      text: `Claim ${i}`,
      evidence: ["E1", "E1"],
    }));
    claims.push({ text: "   ", evidence: ["E1"] });
    const body = resolveReport([{ id: "problem", claims }], base);
    const problem = body.sections.find((s) => s.id === "problem");
    assert.equal(problem.claims.length, 8);
    assert.deepEqual(problem.claims[0].evidenceIds, ["ev-1"]);
  });

  it("ignores ids the topic doesn't have", () => {
    const body = resolveReport([{ id: "problem", claims: [{ text: "x", evidence: ["E1"] }] }], {
      ...base,
      valid: new Set(),
    });
    assert.equal(body.sections[0].claims[0].unsupported, true);
  });
});

describe("resolveReport (question)", () => {
  it("keeps the model's sections, with the same claim checks", () => {
    const body = resolveReport(
      [
        { title: "What people use", claims: [{ text: "Notion.", evidence: ["E1"] }] },
        { title: "Empty", claims: [] },
      ],
      { labels, valid, searched: [] },
    );
    assert.equal(body.sections.length, 1);
    assert.equal(body.sections[0].title, "What people use");
    assert.deepEqual(citedEvidenceIds(body), ["ev-1"]);
  });

  it("says so when nothing answers", () => {
    const body = resolveReport([], { labels, valid, searched: [] });
    assert.equal(body.sections[0].claims[0].note, true);
  });
});

describe("fallbackReport and plans", () => {
  it("is partial, explains why, and keeps the counter section filled", () => {
    const body = fallbackReport(["q1"], VALIDATE_SECTIONS, "The run reached its budget.");
    assert.equal(body.partial, true);
    assert.equal(body.sections[0].claims[0].text, "The run reached its budget.");
    assert.ok(body.sections.find((s) => s.id === "counter").claims.length > 0);
  });

  it("counts only checked counter queries", () => {
    assert.equal(
      counterQueryCount([
        { intent: "counter", checked: true },
        { intent: "counter", checked: false },
        { intent: "pain", checked: true },
      ]),
      1,
    );
  });
});

describe("ensureCounterQueries", async () => {
  const { ensureCounterQueries } = await import("../src/lib/research/report.ts");
  const q = (id, intent) => ({ id, query: `query ${id}`, intent, checked: true });

  it("tops a plan up to the minimum", () => {
    const plan = ensureCounterQueries([q("a", "pain"), q("b", "counter")], "podcast editing", 12);
    assert.equal(counterQueryCount(plan), 2);
  });

  it("replaces other queries when the plan is full", () => {
    const full = Array.from({ length: 3 }, (_, i) => q(`p${i}`, "pain"));
    const plan = ensureCounterQueries(full, "podcast editing", 3);
    assert.equal(plan.length, 3);
    assert.equal(counterQueryCount(plan), 2);
  });

  it("leaves a plan that already has enough alone", () => {
    const ok = [q("a", "counter"), q("b", "counter"), q("c", "pain")];
    assert.deepEqual(ensureCounterQueries(ok, "x", 12), ok);
  });
});
