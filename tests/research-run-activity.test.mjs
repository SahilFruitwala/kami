import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeRunActivity, formatElapsed } from "../src/lib/research/run-activity.ts";

const run = (over = {}) => ({
  state: "running",
  step: "search",
  plan: [],
  progress: {},
  ...over,
});

describe("research run activity", () => {
  it("says nothing once a run has finished", () => {
    for (const state of ["done", "stopped", "failed", "awaiting_plan"]) {
      assert.equal(describeRunActivity(run({ state })), null);
    }
  });

  it("covers a run that has not started working yet", () => {
    assert.equal(
      describeRunActivity(run({ state: "drafting" })).headline,
      "Drafting the search plan",
    );
    assert.equal(describeRunActivity(run({ state: "queued", step: null })).headline, "Starting");
  });

  it("names the search being sent, skipping unchecked ones", () => {
    const plan = [
      { id: "a", query: "first", checked: true },
      { id: "b", query: "skipped", checked: false },
      { id: "c", query: "second", checked: true },
    ];
    const activity = describeRunActivity(run({ plan, progress: { searched: 1, queries: 2 } }));
    assert.equal(activity.headline, "Searching the web · 2 of 2");
    assert.equal(activity.detail, "“second”");
  });

  it("counts pages read and skipped", () => {
    const activity = describeRunActivity(
      run({ step: "fetch", progress: { toRead: ["a", "b", "c"], read: 1, failed: 1 } }),
    );
    assert.equal(activity.headline, "Reading pages · 1 of 3");
    assert.equal(activity.detail, "1 page skipped (couldn't be read)");
  });

  it("reports a pending stop over the step", () => {
    const activity = describeRunActivity(run({ step: "fetch", progress: { stopRequested: true } }));
    assert.equal(activity.headline, "Stopping");
  });

  it("falls back to a generic line for an unknown or ended step", () => {
    assert.equal(describeRunActivity(run({ step: "end" })).headline, "Wrapping up");
  });

  it("formats elapsed time", () => {
    assert.equal(formatElapsed(8_400), "8s");
    assert.equal(formatElapsed(65_000), "1m 05s");
    assert.equal(formatElapsed(3_720_000), "1h 02m");
    assert.equal(formatElapsed(-5), "0s");
  });
});
