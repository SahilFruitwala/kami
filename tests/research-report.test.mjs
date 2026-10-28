import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assembleQuestionReport,
  assembleValidateReport,
  canonicalLabel,
  checkClaims,
  counterSearchCount,
  ensureCounterSection,
  mergeCounterQueries,
  partialReport,
  requiredCounterQueries,
  VALIDATE_SECTION_IDS,
} from "../src/lib/research/report.ts";

describe("validate reports", () => {
  it("drops unknown evidence ids and marks a claim with none as unsupported", () => {
    const [section] = checkClaims(
      [
        {
          id: "problem",
          title: "The problem",
          claims: [
            { text: "  People hate editing.  ", evidenceIds: ["e1", "missing", "e1", ""] },
            { text: "Made up.", evidenceIds: ["nope"] },
            { text: "   ", evidenceIds: ["e1"] },
          ],
        },
      ],
      new Set(["e1"]),
    );
    assert.deepEqual(section.claims, [
      { text: "People hate editing.", evidenceIds: ["e1"] },
      { text: "Made up.", evidenceIds: [], unsupported: true },
    ]);
  });

  it("fills an empty counter-evidence section with what was searched", () => {
    const sections = ensureCounterSection(
      [
        { id: "problem", title: "The problem", claims: [{ text: "Hard.", evidenceIds: ["e1"] }] },
        { id: "counter", title: "Counter-evidence", claims: [] },
      ],
      ["editing good enough", "market too small"],
    );
    const counter = sections.find((s) => s.id === "counter");
    assert.equal(counter.claims.length, 1);
    assert.match(counter.claims[0].text, /Nothing turned up/);
    assert.match(counter.claims[0].text, /editing good enough/);
    assert.match(counter.claims[0].text, /market too small/);
    assert.equal(counter.claims[0].unsupported, undefined);
  });

  it("leaves a non-empty counter-evidence section alone", () => {
    const claim = { text: "People said it's fine.", evidenceIds: ["e2"] };
    const [counter] = ensureCounterSection(
      [{ id: "counter", title: "Counter-evidence", claims: [claim] }],
      ["ignored"],
    );
    assert.deepEqual(counter.claims, [claim]);
  });

  it("assembles every Validate section, checks citations, and never leaves counter empty", () => {
    const body = assembleValidateReport(
      [
        {
          id: "problem",
          claims: [{ text: "Editing takes hours.", evidenceIds: ["e1", "ghost"] }],
        },
        { id: "unknown", claims: [{ text: "Dropped section.", evidenceIds: [] }] },
      ],
      new Set(["e1"]),
      ["why I stopped using Descript"],
    );
    assert.deepEqual(
      body.sections.map((s) => s.id),
      [...VALIDATE_SECTION_IDS],
    );
    assert.deepEqual(body.sections[0].claims, [
      { text: "Editing takes hours.", evidenceIds: ["e1"] },
    ]);
    const counter = body.sections.find((s) => s.id === "counter");
    assert.match(counter.claims[0].text, /Nothing turned up/);
    assert.match(counter.claims[0].text, /stopped using Descript/);
  });

  it("requires the five counter-evidence searches and marks matching plan queries", () => {
    const required = requiredCounterQueries("Editing remote interviews");
    assert.equal(required.length, 5);
    assert.ok(required.every((q) => q.counter));
    assert.ok(required.some((q) => /good enough/.test(q.query)));
    assert.ok(required.some((q) => /stopped using/.test(q.query)));
    assert.ok(required.some((q) => /not worth it/.test(q.query)));
    assert.ok(required.some((q) => /shut down/.test(q.query)));
    assert.ok(required.some((q) => /market too small/.test(q.query)));

    const merged = mergeCounterQueries(
      [
        {
          id: "q1",
          query: "editing remote interviews frustrating",
          intent: "pain",
          checked: true,
        },
        {
          id: "q2",
          query: "Descript good enough for podcasts",
          intent: "pain",
          checked: true,
        },
      ],
      "Editing remote interviews",
      "quick",
    );
    assert.equal(merged.find((q) => q.id === "q2")?.counter, true);
    assert.equal(merged.find((q) => q.id === "q1")?.counter, undefined);
    assert.equal(merged.filter((q) => q.counter).length, 5);
    assert.ok(merged.some((q) => /stopped using/.test(q.query)));
  });

  it("keeps the required counter searches inside the depth's query cap", () => {
    const filler = Array.from({ length: 12 }, (_, i) => ({
      id: `q${i + 1}`,
      query: `support query ${i + 1}`,
      intent: "pain",
      checked: true,
    }));
    const merged = mergeCounterQueries(filler, "invoicing", "quick");
    assert.ok(merged.length <= 12);
    assert.equal(merged.filter((q) => q.counter).length, 5);
  });
});

describe("question reports", () => {
  it("keeps the model's sections, checks citations, and has no fixed template", () => {
    const body = assembleQuestionReport(
      [
        {
          title: "  What people say  ",
          claims: [
            { text: "Editing takes hours.", evidenceIds: ["e1", "ghost"] },
            { text: "Invented.", evidenceIds: ["nope"] },
          ],
        },
        { title: "Open questions", claims: [{ text: "Would they pay?", evidenceIds: [] }] },
      ],
      new Set(["e1"]),
    );
    assert.deepEqual(
      body.sections.map((s) => s.title),
      ["What people say", "Open questions"],
    );
    assert.notDeepEqual(
      body.sections.map((s) => s.id),
      [...VALIDATE_SECTION_IDS],
    );
    assert.deepEqual(body.sections[0].claims, [
      { text: "Editing takes hours.", evidenceIds: ["e1"] },
      { text: "Invented.", evidenceIds: [], unsupported: true },
    ]);
    assert.equal(body.sections[1].claims[0].unsupported, true);
  });

  it("always produces a section when the model wrote nothing usable", () => {
    const body = assembleQuestionReport(
      [{ title: "Empty", claims: [{ text: "   ", evidenceIds: ["e1"] }] }],
      new Set(["e1"]),
    );
    assert.equal(body.sections.length, 1);
    assert.equal(body.sections[0].title, "Answer");
    assert.equal(body.sections[0].claims[0].unsupported, true);
    assert.match(body.sections[0].claims[0].text, /Nothing in the quotes/);
  });
});

describe("report helpers", () => {
  it("reads quote labels in the forms models write them", () => {
    for (const raw of ["E3", "e3", "[E3]", " E 3 ", "3", "[3]"])
      assert.equal(canonicalLabel(raw), "E3");
    for (const raw of ["", "E", "source 3", "E3a", "abc"]) assert.equal(canonicalLabel(raw), null);
  });

  it("counts only checked counter searches, read from the query text", () => {
    const plan = [
      { query: "podcast editing good enough", checked: true },
      { query: "why I stopped using podcast editors", checked: false },
      { query: "podcast editor market too small" },
      { query: "podcast editing pain", checked: true, counter: true },
    ];
    assert.equal(counterSearchCount(plan), 2);
  });

  it("marks a code-written report partial and says why first", () => {
    const body = partialReport(
      { sections: [{ id: "a", title: "A", claims: [{ text: "x", evidenceIds: ["e1"] }] }] },
      "Out of budget.",
    );
    assert.equal(body.partial, true);
    assert.deepEqual(
      body.sections[0].claims.map((c) => c.text),
      ["Out of budget.", "x"],
    );
  });
});
