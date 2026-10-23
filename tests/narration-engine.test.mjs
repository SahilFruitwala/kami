import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  JOIN_BUDGET_MS,
  LEASE_MS,
  STEP_BUDGET_MS,
  applyEvent,
  canClaim,
  isStalled,
  nextStep,
  refuseStart,
  resume,
  settleReservation,
  startKind,
} from "../src/lib/narration-engine.ts";

const T0 = 1_000_000;

const narration = (over = {}) => ({
  state: "queued",
  pausedReason: null,
  parts: ["one.", "two.", "three."],
  partsDone: 0,
  reservedChars: 15,
  charsSpoken: 0,
  tidyAttempted: false,
  leaseUntil: null,
  runId: null,
  ...over,
});

const ctx = (over = {}) => ({
  now: T0,
  runId: "run-a",
  timeLeftMs: 250_000,
  tidyState: "tidied",
  deleted: false,
  ...over,
});

/**
 * Drive the engine like the run loop does, with a scripted world. Returns
 * the actions taken, in order, and the final narration.
 */
function run(start, { context = {}, speak = () => ({ ok: true }), steps = 50 } = {}) {
  let n = applyEvent(start, { type: "claimed", runId: "run-a", now: T0 });
  const taken = [];
  for (let i = 0; i < steps; i++) {
    const action = nextStep(n, ctx(context));
    taken.push(action);
    if (action.type === "exit" || action.type === "hand-off") break;
    if (action.type === "tidy") {
      n = applyEvent(n, { type: "tidying" });
      n = applyEvent(n, { type: "tidied", parts: context.tidiedParts ?? null });
    } else if (action.type === "speak") {
      const outcome = speak(action.index);
      n = outcome.ok
        ? applyEvent(n, {
            type: "spoken",
            index: action.index,
            chars: n.parts[action.index].length,
            now: T0,
          })
        : applyEvent(n, { type: "failed", reason: outcome.reason });
    } else if (action.type === "join") {
      n = applyEvent(n, { type: "joined" });
    }
  }
  return { taken, n };
}

const kinds = (taken) => taken.map((a) => (a.type === "speak" ? `speak ${a.index}` : a.type));

describe("narration engine: a run", () => {
  it("speaks every part in order, joins, and ends ready", () => {
    const { taken, n } = run(narration());
    assert.deepEqual(kinds(taken), ["speak 0", "speak 1", "speak 2", "join", "exit"]);
    assert.equal(n.state, "ready");
    assert.equal(n.charsSpoken, 14);
    assert.equal(n.leaseUntil, null);
  });

  it("tidies first when the article isn't tidied, then speaks the tidied script", () => {
    const { taken, n } = run(narration(), {
      context: { tidyState: "pending", tidiedParts: ["one.", "three."] },
    });
    assert.deepEqual(kinds(taken), ["tidy", "speak 0", "speak 1", "join", "exit"]);
    assert.deepEqual(n.parts, ["one.", "three."]);
    assert.equal(n.charsSpoken, 10);
  });

  it("gives Tidy one chance only, and goes on untidied if it fails", () => {
    const { taken } = run(narration(), { context: { tidyState: "failed", tidiedParts: null } });
    assert.deepEqual(kinds(taken).slice(0, 2), ["tidy", "speak 0"]);
    assert.equal(kinds(taken).filter((k) => k === "tidy").length, 1);
  });

  it("never swaps in a tidied script longer than what was reserved", () => {
    const n = applyEvent(narration(), { type: "tidied", parts: ["x".repeat(100)] });
    assert.deepEqual(n.parts, ["one.", "two.", "three."]);
  });

  it("resumes after a crash from the last finished part, re-speaking at most that part", () => {
    // The previous run stored part 1's audio but died before recording it.
    const crashed = narration({
      state: "narrating",
      partsDone: 1,
      charsSpoken: 4,
      leaseUntil: T0 - 1,
      runId: "dead-run",
    });
    assert.ok(isStalled(crashed, T0));
    assert.ok(canClaim(crashed, "run-a", T0));
    const { taken, n } = run(crashed);
    assert.deepEqual(kinds(taken), ["speak 1", "speak 2", "join", "exit"]);
    assert.equal(n.charsSpoken, 14);
  });

  it("a second run exits while another holds a live lease", () => {
    const held = narration({ state: "narrating", leaseUntil: T0 + 10_000, runId: "run-b" });
    assert.equal(canClaim(held, "run-a", T0), false);
    assert.deepEqual(nextStep(held, ctx()), { type: "exit", reason: "lease-held" });
    assert.equal(isStalled(held, T0), false);
  });

  it("hands off when too little time is left for another part", () => {
    const n = narration({ state: "narrating", runId: "run-a", leaseUntil: T0 + LEASE_MS });
    assert.deepEqual(nextStep(n, ctx({ timeLeftMs: STEP_BUDGET_MS - 1 })), { type: "hand-off" });
    assert.equal(nextStep(n, ctx({ timeLeftMs: STEP_BUDGET_MS })).type, "speak");
  });

  it("needs more time to join than to speak", () => {
    const n = narration({ state: "joining", partsDone: 3, runId: "run-a", leaseUntil: T0 + 1 });
    assert.deepEqual(nextStep(n, ctx({ timeLeftMs: JOIN_BUDGET_MS - 1 })), { type: "hand-off" });
    assert.deepEqual(nextStep(n, ctx({ timeLeftMs: JOIN_BUDGET_MS })), { type: "join" });
  });

  it("pauses with a reason when speaking fails, and stops", () => {
    const { taken, n } = run(narration(), {
      speak: (i) => (i === 1 ? { ok: false, reason: "Deepgram is out of funds." } : { ok: true }),
    });
    assert.deepEqual(kinds(taken), ["speak 0", "speak 1", "exit"]);
    assert.equal(n.state, "paused");
    assert.equal(n.pausedReason, "Deepgram is out of funds.");
    assert.equal(n.partsDone, 1);
  });

  it("stops at the next step when the narration is deleted mid-run", () => {
    const n = narration({ state: "narrating", partsDone: 1, runId: "run-a", leaseUntil: T0 + 1 });
    assert.deepEqual(nextStep(n, ctx({ deleted: true })), { type: "exit", reason: "deleted" });
  });

  it("ignores a spoken event for a part that isn't next (a duplicate report)", () => {
    const n = narration({ state: "narrating", partsDone: 2 });
    assert.equal(applyEvent(n, { type: "spoken", index: 1, chars: 4, now: T0 }), n);
  });
});

describe("narration engine: resume and settle", () => {
  it("Resume picks up where the paused narration stopped", () => {
    const paused = narration({ state: "paused", pausedReason: "x", partsDone: 2, runId: null });
    const resumed = resume(paused);
    assert.equal(resumed.state, "narrating");
    assert.equal(resumed.pausedReason, null);
    assert.equal(nextStep(resumed, ctx()).type, "speak");
    assert.deepEqual(nextStep(resumed, ctx()), { type: "speak", index: 2 });
  });

  it("a paused narration only resumes when its owner asks", () => {
    assert.deepEqual(nextStep(narration({ state: "paused" }), ctx()), {
      type: "exit",
      reason: "paused",
    });
    assert.equal(isStalled(narration({ state: "paused" }), T0), false);
  });

  it("returns exactly what wasn't spoken", () => {
    assert.equal(settleReservation({ reservedChars: 15, charsSpoken: 10 }), 5);
    assert.equal(settleReservation({ reservedChars: 15, charsSpoken: 15 }), 0);
  });
});

describe("narration engine: refusals before any speech", () => {
  const ok = { isStub: false, english: true, chars: 50_000, limit: 120_000, available: 60_000 };

  it("accepts a narration that passes every check", () => {
    assert.equal(refuseStart(ok), null);
  });

  it("refuses in order: stub, language, length, allowance", () => {
    assert.deepEqual(refuseStart({ ...ok, isStub: true, english: false }), { code: "stub" });
    assert.deepEqual(refuseStart({ ...ok, english: false, chars: 999_999 }), {
      code: "unsupported_language",
    });
    assert.deepEqual(refuseStart({ ...ok, chars: 130_000, available: 0 }), {
      code: "too_long",
      chars: 130_000,
      limit: 120_000,
    });
    assert.deepEqual(refuseStart({ ...ok, available: 49_999 }), {
      code: "no_allowance",
      needed: 50_000,
      available: 49_999,
    });
    assert.deepEqual(refuseStart({ ...ok, chars: 0 }), { code: "stub" });
  });

  it("decides what Create audio means for the article's current narration", () => {
    assert.equal(startKind(null, false), "create");
    assert.equal(startKind({ state: "narrating" }, false), "running");
    assert.equal(startKind({ state: "queued" }, true), "running");
    assert.equal(startKind({ state: "paused" }, false), "resume");
    assert.equal(startKind({ state: "ready" }, false), "ready");
    assert.equal(startKind({ state: "ready" }, true), "recreate");
  });
});
