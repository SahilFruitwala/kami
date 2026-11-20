import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildYear } from "../src/lib/compass/year.ts";

const goal = (id, quarter, over = {}) => ({
  id,
  name: id,
  why: null,
  color: "teal",
  milestones: [{ id: `${id}-m`, title: "m", dueOn: null, weight: "M", done: false }],
  outcome: null,
  carriedFromGoalId: null,
  ...over,
});
const q = (n, mode, goals = []) => ({ quarter: { year: 2026, quarter: n }, mode, goals });

const rec = (over = {}) => ({
  year: 2026,
  today: "2026-11-19",
  weekStart: 1,
  quarters: [
    q(1, "past"),
    q(2, "past"),
    q(3, "past", [goal("cloud", 3, { outcome: "carried" }), goal("ship", 3, { outcome: "done" })]),
    q(4, "current", [goal("cloud-2", 4, { carriedFromGoalId: "cloud" })]),
  ],
  habits: [
    {
      id: "read",
      goalId: null,
      name: "Read",
      kind: "check",
      target: null,
      unit: null,
      createdOn: "2026-11-09",
      pausedOn: null,
      pauses: [],
      archivedOn: null,
      schedules: [{ startsOn: "2026-11-09", rule: "daily" }],
    },
  ],
  logs: [
    ...["09", "10", "11", "12", "13", "14", "15"].map((d) => ({
      habitId: "read",
      day: `2026-11-${d}`,
      value: 1,
    })),
  ],
  ...over,
});

describe("year view", () => {
  it("lays out every week of the year by quarter", () => {
    const y = buildYear(rec());
    assert.equal(y.weeks.length, 52);
    assert.equal(y.quarterStarts.length, 4);
    assert.equal(y.weeks[y.currentWeek], "2026-11-16");
  });

  it("links carried goals both ways", () => {
    const y = buildYear(rec());
    const cloud = y.quarters[2].goals.find((g) => g.goal.id === "cloud");
    const next = y.quarters[3].goals[0];
    assert.deepEqual(cloud.to, { year: 2026, quarter: 4 });
    assert.deepEqual(next.from, { year: 2026, quarter: 3 });
    assert.equal(y.quarters[2].goals.find((g) => g.goal.id === "ship").to, null);
  });

  it("fills a habit's weeks only from when it started up to today", () => {
    const y = buildYear(rec());
    const row = y.rows[0];
    const i = y.weeks.indexOf("2026-11-09");
    assert.equal(row.weeks[i], 1);
    assert.equal(row.weeks[i - 1], null); // before it existed
    assert.equal(row.weeks[i + 2], null); // still ahead
  });
});
