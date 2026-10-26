import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeIdeaTitle, resolveAssignments } from "../src/lib/research/match.ts";

const quotes = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"].map((label, i) => ({
  label,
  evidenceId: `e${i + 1}`,
}));
const live = [{ label: "I1", id: "idea-edit", title: "Editing takes hours" }];
const dismissed = [{ label: "D1", id: "idea-noise", title: "Background noise ruins takes" }];

describe("resolveAssignments", () => {
  it("attaches to named ideas, creates new ones, and never duplicates a title", () => {
    const r = resolveAssignments({
      quotes,
      live,
      dismissed,
      answers: [
        { quote: "Q1", idea: "I1" },
        { quote: "q2", idea: "d1" },
        {
          quote: "Q3",
          idea: "new",
          title: "Transcripts are inaccurate",
          summary: "For interviews.",
        },
        { quote: "Q4", idea: "new", title: "transcripts  are INACCURATE!", summary: "dup" },
        { quote: "Q5", idea: "new", title: "Editing takes hours." },
        { quote: "Q6", idea: "I9" },
      ],
    });
    assert.deepEqual(r.attach, [
      { evidenceId: "e1", ideaId: "idea-edit" },
      { evidenceId: "e2", ideaId: "idea-noise" },
      { evidenceId: "e5", ideaId: "idea-edit" },
    ]);
    assert.deepEqual(r.create, [
      {
        title: "Transcripts are inaccurate",
        summary: "For interviews.",
        evidenceIds: ["e3", "e4"],
      },
    ]);
    assert.deepEqual(r.unmatched, ["e6", "e7"], "unknown idea, and no answer at all");
  });

  it("leaves a quote unmatched when a new idea has no title", () => {
    const r = resolveAssignments({
      quotes: quotes.slice(0, 1),
      live: [],
      dismissed: [],
      answers: [{ quote: "Q1", idea: "new", title: "  " }],
    });
    assert.deepEqual(r.unmatched, ["e1"]);
    assert.deepEqual(r.create, []);
  });

  it("caps new titles and summaries", () => {
    const r = resolveAssignments({
      quotes: quotes.slice(0, 1),
      live: [],
      dismissed: [],
      answers: [{ quote: "Q1", idea: "new", title: "t".repeat(200), summary: "s".repeat(500) }],
    });
    assert.equal(r.create[0].title.length, 80);
    assert.equal(r.create[0].summary.length, 300);
  });
});

describe("normalizeIdeaTitle", () => {
  it("ignores case, punctuation and spacing", () => {
    assert.equal(normalizeIdeaTitle("  Editing — takes HOURS!! "), "editing takes hours");
  });
});
