import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withAutoLogs } from "../src/lib/compass/auto.ts";
import { toLogMap, withLog } from "../src/lib/compass/model.ts";

const check = { id: "read", kind: "check" };
const count = { id: "pages", kind: "count" };
const contrib = (over = {}) => ({
  linkId: "l1",
  habitId: "read",
  day: "2026-11-20",
  amount: 12,
  unit: "pages",
  label: "Dune",
  counted: true,
  ...over,
});

describe("withAutoLogs", () => {
  it("ticks a check habit on a day a link counted", () => {
    const out = withAutoLogs([], [contrib()], [check]);
    assert.deepEqual(out, [{ habitId: "read", day: "2026-11-20", value: 1, auto: true }]);
  });

  it("leaves a manual check-in as the record for that day", () => {
    const manual = [{ habitId: "read", day: "2026-11-20", value: 1 }];
    assert.deepEqual(withAutoLogs(manual, [contrib()], [check]), manual);
  });

  it("ticks a day once when two books both counted", () => {
    const out = withAutoLogs([], [contrib(), contrib({ linkId: "l2", label: "Emma" })], [check]);
    assert.equal(out.length, 1);
  });

  it("ignores a contribution that did not meet its threshold", () => {
    assert.deepEqual(withAutoLogs([], [contrib({ counted: false })], [check]), []);
  });

  it("never rewrites a counted habit's own number", () => {
    const logs = [{ habitId: "pages", day: "2026-11-20", value: 8 }];
    const out = withAutoLogs(logs, [contrib({ habitId: "pages" })], [count]);
    assert.deepEqual(out, logs);
  });

  it("feeds the streak engine like any other check-in", () => {
    const out = withAutoLogs([], [contrib()], [check]);
    assert.equal(toLogMap(out).get("read").get("2026-11-20"), 1);
  });

  it("does not mutate its input", () => {
    const logs = [];
    withAutoLogs(logs, [contrib()], [check]);
    assert.equal(logs.length, 0);
  });
});

describe("withLog", () => {
  const snap = () => ({
    logs: [{ habitId: "read", day: "2026-11-20", value: 1, auto: true }],
    contributions: [contrib(), contrib({ habitId: "other" })],
  });

  it("clearing a day also clears what linked reading added to it", () => {
    const next = withLog(snap(), "read", "2026-11-20", 0);
    assert.deepEqual(next.logs, []);
    assert.deepEqual(
      next.contributions.map((c) => c.habitId),
      ["other"],
    );
  });

  it("ticking a day keeps the reading detail", () => {
    const next = withLog(snap(), "read", "2026-11-20", 1);
    assert.equal(next.contributions.length, 2);
    assert.deepEqual(next.logs, [{ habitId: "read", day: "2026-11-20", value: 1 }]);
  });
});
