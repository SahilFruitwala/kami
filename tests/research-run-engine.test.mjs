import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  END_STEP,
  currentStep,
  fitsBudget,
  isStalledRun,
  nextAction,
  stepAfter,
} from "../src/lib/research/run-engine.ts";

const steps = [
  { name: "search" },
  { name: "fetch", unitBudgetMs: 60_000 },
  { name: "score", final: true },
];

const run = (over = {}) => ({
  state: "running",
  step: null,
  stopReason: null,
  stopRequested: false,
  leaseUntil: null,
  runLease: null,
  ...over,
});

const ctx = (over = {}) => ({ now: 1_000, lease: "me", timeLeftMs: 300_000, ...over });

describe("research run engine", () => {
  it("starts at the first step and resumes at the saved one", () => {
    assert.deepEqual(nextAction(steps, run(), ctx()), { type: "work", step: "search" });
    assert.deepEqual(nextAction(steps, run({ step: "fetch" }), ctx()), {
      type: "work",
      step: "fetch",
    });
  });

  it("walks the steps in order and ends after the last", () => {
    assert.equal(stepAfter(steps, "search", false), "fetch");
    assert.equal(stepAfter(steps, "score", false), END_STEP);
    assert.deepEqual(nextAction(steps, run({ step: END_STEP }), ctx()), {
      type: "finish",
      state: "done",
      stopReason: null,
    });
  });

  it("once stopping, only final steps run, and the run ends stopped", () => {
    const stopping = run({ step: "search", stopReason: "budget" });
    assert.equal(currentStep(steps, stopping), "score");
    assert.equal(stepAfter(steps, "search", true), "score");
    assert.deepEqual(nextAction(steps, run({ step: END_STEP, stopRequested: true }), ctx()), {
      type: "finish",
      state: "stopped",
      stopReason: "user",
    });
    assert.deepEqual(nextAction(steps, run({ step: END_STEP, stopReason: "budget" }), ctx()), {
      type: "finish",
      state: "stopped",
      stopReason: "budget",
    });
  });

  it("hands off when a unit of the current step wouldn't fit the time left", () => {
    assert.deepEqual(nextAction(steps, run(), ctx({ timeLeftMs: 119_999 })), { type: "hand-off" });
    assert.deepEqual(nextAction(steps, run({ step: "fetch" }), ctx({ timeLeftMs: 60_000 })), {
      type: "work",
      step: "fetch",
    });
  });

  it("leaves a run alone while another invocation holds a live lease", () => {
    const held = run({ leaseUntil: 5_000, runLease: "other" });
    assert.deepEqual(nextAction(steps, held, ctx()), { type: "exit", reason: "lease-held" });
    assert.equal(nextAction(steps, held, ctx({ now: 5_001 })).type, "work");
    assert.equal(nextAction(steps, run({ leaseUntil: 5_000, runLease: "me" }), ctx()).type, "work");
  });

  it("does nothing for runs that aren't active", () => {
    for (const state of ["drafting", "awaiting_plan", "done", "stopped", "failed"]) {
      assert.deepEqual(nextAction(steps, run({ state }), ctx()), {
        type: "exit",
        reason: "inactive",
      });
    }
  });

  it("calls an active run stalled once nobody holds its lease", () => {
    assert.equal(isStalledRun({ state: "running", leaseUntil: null }, 10), true);
    assert.equal(isStalledRun({ state: "queued", leaseUntil: 10 }, 10), true);
    assert.equal(isStalledRun({ state: "running", leaseUntil: 11 }, 10), false);
    assert.equal(isStalledRun({ state: "done", leaseUntil: null }, 10), false);
  });

  it("allows a call only when its worst case still fits the budget", () => {
    const spent = { firecrawlCredits: 25, tokensIn: 10_000, tokensOut: 0 };
    // 25 + ceil(10k / 20k) = 26 spent; budget 30.
    assert.equal(fitsBudget(spent, { firecrawlCredits: 4 }, 30, 20_000), true);
    assert.equal(fitsBudget(spent, { firecrawlCredits: 5 }, 30, 20_000), false);
    // 25 + ceil(90k / 20k) = 30 fits exactly; one more token tips it over.
    assert.equal(fitsBudget(spent, { tokensIn: 80_000 }, 30, 20_000), true);
    assert.equal(fitsBudget(spent, { tokensIn: 90_001 }, 30, 20_000), false);
  });
});
