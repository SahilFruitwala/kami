import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  localDay,
  quarterElapsed,
  quarterOf,
  quarterWeeks,
  weekStartOf,
  weekday,
} from "../src/lib/compass/dates.ts";
import {
  canEditDay,
  consistency,
  dueToday,
  goalProgress,
  onPace,
  passesFor,
  streak,
  weekStat,
} from "../src/lib/compass/engine.ts";

const habit = (over = {}) => ({
  id: "h",
  kind: "check",
  target: null,
  createdOn: "2026-11-02",
  pausedOn: null,
  pauses: [],
  schedules: [{ startsOn: "2026-11-02", rule: "daily" }],
  ...over,
});
const logsOf = (days, value = 1, id = "h") => new Map([[id, new Map(days.map((d) => [d, value]))]]);
const range = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i));

describe("dates", () => {
  it("numbers weekdays from Monday", () => {
    assert.equal(weekday("2026-11-16"), 0); // Monday
    assert.equal(weekday("2026-11-22"), 6); // Sunday
  });

  it("finds the week start for either setting", () => {
    assert.equal(weekStartOf("2026-11-19", 1), "2026-11-16");
    assert.equal(weekStartOf("2026-11-19", 0), "2026-11-15");
  });

  it("puts a week in the quarter its last day falls in", () => {
    const weeks = quarterWeeks({ year: 2026, quarter: 4 }, 1);
    assert.equal(weeks[0], "2026-09-28"); // ends Oct 4
    assert.equal(weeks.at(-1), "2026-12-21"); // Dec 28 – Jan 3 belongs to Q1
    assert.equal(weeks.length, 13);
    assert.deepEqual(quarterOf("2026-12-30", 1), { year: 2027, quarter: 1 });
  });

  it("measures how much of the quarter has passed", () => {
    const q = { year: 2026, quarter: 4 };
    const e = quarterElapsed(q, "2026-11-19", 1);
    assert.ok(e > 0.55 && e < 0.62, String(e));
  });

  it("reads today in the user's timezone", () => {
    const at = new Date("2026-11-19T23:30:00Z");
    assert.equal(localDay("UTC", at), "2026-11-19");
    assert.equal(localDay("Asia/Tokyo", at), "2026-11-20");
    assert.equal(localDay("Not/AZone", at), "2026-11-19");
  });
});

describe("check-in window", () => {
  it("allows today and the six days before only", () => {
    assert.ok(canEditDay("2026-11-19", "2026-11-19"));
    assert.ok(canEditDay("2026-11-13", "2026-11-19"));
    assert.ok(!canEditDay("2026-11-12", "2026-11-19"));
    assert.ok(!canEditDay("2026-11-20", "2026-11-19"));
  });
});

describe("weekly targets", () => {
  it("counts scheduled days for a specific-days habit", () => {
    const h = habit({ schedules: [{ startsOn: "2026-11-02", rule: "days", days: [0, 2, 4] }] });
    const stat = weekStat(h, logsOf(["2026-11-16", "2026-11-18"]), "2026-11-16");
    assert.deepEqual(stat, { done: 2, target: 3 });
  });

  it("prorates the week a habit was created in", () => {
    const h = habit({ createdOn: "2026-11-19" });
    assert.equal(weekStat(h, new Map(), "2026-11-16").target, 4);
  });

  it("keeps old targets after a schedule change", () => {
    const h = habit({
      schedules: [
        { startsOn: "2026-11-02", rule: "per_week", perWeek: 2 },
        { startsOn: "2026-11-16", rule: "per_week", perWeek: 4 },
      ],
    });
    assert.equal(weekStat(h, new Map(), "2026-11-09").target, 2);
    assert.equal(weekStat(h, new Map(), "2026-11-16").target, 4);
  });

  it("does not count paused days against the habit", () => {
    const h = habit({ pauses: [{ from: "2026-11-09", to: "2026-11-15" }] });
    assert.equal(weekStat(h, new Map(), "2026-11-09").target, 0);
  });

  it("counts an amount habit only when the target is reached", () => {
    const h = habit({ kind: "count", target: 8000 });
    const logs = new Map([
      [
        "h",
        new Map([
          ["2026-11-16", 9000],
          ["2026-11-17", 3000],
        ]),
      ],
    ]);
    assert.equal(weekStat(h, logs, "2026-11-16").done, 1);
  });
});

describe("today's list", () => {
  it("shows specific-days habits only on their days", () => {
    const h = habit({ schedules: [{ startsOn: "2026-11-02", rule: "days", days: [1] }] });
    assert.ok(dueToday(h, new Map(), "2026-11-17", 1)); // Tuesday
    assert.ok(!dueToday(h, new Map(), "2026-11-19", 1));
  });

  it("drops a times-a-week habit once the week's target is met", () => {
    const h = habit({ schedules: [{ startsOn: "2026-11-02", rule: "per_week", perWeek: 2 }] });
    assert.ok(dueToday(h, logsOf(["2026-11-16"]), "2026-11-19", 1));
    assert.ok(!dueToday(h, logsOf(["2026-11-16", "2026-11-17"]), "2026-11-19", 1));
    // …but keeps it if it was ticked today, so it can be unticked.
    assert.ok(dueToday(h, logsOf(["2026-11-16", "2026-11-19"]), "2026-11-19", 1));
  });

  it("hides paused habits", () => {
    assert.ok(!dueToday(habit({ pausedOn: "2026-11-18" }), new Map(), "2026-11-19", 1));
  });
});

describe("consistency", () => {
  it("ignores the unfinished current week unless it is already met", () => {
    const weeks = ["2026-11-02", "2026-11-09", "2026-11-16"];
    const all = range("2026-11-02", 14);
    assert.equal(consistency(habit(), logsOf(all), weeks, "2026-11-17"), 1);
  });
});

describe("goal progress", () => {
  it("weights milestones by size", () => {
    const p = goalProgress([
      { weight: "S", done: true },
      { weight: "L", done: false },
    ]);
    assert.equal(p, 0.25);
    assert.equal(goalProgress([]), null);
  });

  it("allows a little slack before calling a goal behind", () => {
    assert.ok(onPace(0.5, 0.54));
    assert.ok(!onPace(0.4, 0.56));
  });
});

describe("streaks", () => {
  it("gives 5 passes to frequent habits and 3 to the rest", () => {
    assert.equal(passesFor({ rule: "daily" }), 5);
    assert.equal(passesFor({ rule: "days", days: [0, 2, 4, 6] }), 5);
    assert.equal(passesFor({ rule: "per_week", perWeek: 3 }), 3);
  });

  it("counts consecutive days and leaves today open", () => {
    const s = streak(habit(), logsOf(range("2026-11-02", 17)), "2026-11-19", 1);
    assert.equal(s.current, 17); // Nov 2–18, today not done yet
    assert.equal(s.passesLeft, 5);
  });

  it("spends a pass on a miss instead of breaking the streak", () => {
    const days = range("2026-11-02", 18).filter((d) => d !== "2026-11-10");
    const s = streak(habit(), logsOf(days), "2026-11-19", 1);
    assert.equal(s.current, 17);
    assert.equal(s.passesLeft, 4);
    assert.equal(s.lastPassOn, "2026-11-10");
  });

  it("resets once the quarter's passes run out", () => {
    const h = habit({ schedules: [{ startsOn: "2026-11-02", rule: "days", days: [1] }] }); // 3 passes
    // Tuesdays Nov 3, 10, 17 missed; Nov 24 missed too (4th) → reset. Then Dec 1 done.
    const s = streak(h, logsOf(["2026-12-01"]), "2026-12-02", 1);
    assert.equal(s.current, 1);
    assert.equal(s.passesLeft, 0);
  });

  it("refills passes in a new quarter", () => {
    const h = habit({
      createdOn: "2026-12-14",
      schedules: [{ startsOn: "2026-12-14", rule: "daily" }],
    });
    const done = range("2026-12-14", 25).filter(
      (d) => !["2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18", "2026-12-19"].includes(d),
    );
    // 5 misses use all of Q4's passes; Q1 2027 starts Dec 28 with 5 fresh ones.
    const s = streak(h, logsOf(done), "2027-01-07", 1);
    assert.equal(s.current, 20); // 20 days done; the 5 covered days keep it alive but do not add to it
    assert.equal(s.passesLeft, 5);
  });

  it("does not let paused days break a streak", () => {
    const h = habit({ pauses: [{ from: "2026-11-05", to: "2026-11-12" }] });
    const days = [...range("2026-11-02", 3), ...range("2026-11-13", 6)];
    assert.equal(streak(h, logsOf(days), "2026-11-19", 1).current, 9);
  });

  it("counts weeks for a times-a-week habit", () => {
    const h = habit({ schedules: [{ startsOn: "2026-11-02", rule: "per_week", perWeek: 2 }] });
    const s = streak(
      h,
      logsOf(["2026-11-03", "2026-11-05", "2026-11-10", "2026-11-12"]),
      "2026-11-19",
      1,
    );
    assert.equal(s.current, 2); // two full weeks; this week still open
    assert.equal(s.passesTotal, 3);
  });
});
