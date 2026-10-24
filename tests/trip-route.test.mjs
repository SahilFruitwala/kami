import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dayWarnings,
  formatDuration,
  itemTiming,
  parseTime,
  slotForTime,
} from "../src/lib/trip-route.ts";
import { DAY_COLORS, dayColor, OVERFLOW_DAY_COLOR } from "../src/lib/trip-colors.ts";

const item = (over) => ({
  id: "i",
  slot: "morning",
  title: "Stop",
  startTime: null,
  durationMin: null,
  ...over,
});

describe("time helpers", () => {
  it("parses 24-hour times", () => {
    assert.equal(parseTime("09:30"), 570);
    assert.equal(parseTime("23:59"), 1439);
    for (const bad of ["9:30", "24:00", "12:60", "", "noon"])
      assert.equal(parseTime(bad), null, bad);
  });

  it("formats durations", () => {
    assert.equal(formatDuration(45), "45 min");
    assert.equal(formatDuration(120), "2 h");
    assert.equal(formatDuration(95), "1 h 35 min");
  });

  it("maps times to slots", () => {
    assert.equal(slotForTime(parseTime("08:00")), "morning");
    assert.equal(slotForTime(parseTime("13:00")), "afternoon");
    assert.equal(slotForTime(parseTime("19:30")), "evening");
    assert.equal(slotForTime(parseTime("22:00")), "night");
  });

  it("falls back to the slot's time and length", () => {
    assert.deepEqual(itemTiming(item({ slot: "evening" })), {
      start: 1140,
      minutes: 120,
      explicit: false,
    });
    assert.deepEqual(itemTiming(item({ startTime: "10:15", durationMin: 45 })), {
      start: 615,
      minutes: 45,
      explicit: true,
    });
  });
});

describe("dayWarnings", () => {
  it("flags packed and overlapping timed plans", () => {
    const packed = dayWarnings([
      item({ id: "a", durationMin: 400 }),
      item({ id: "b", durationMin: 400 }),
    ]);
    assert.match(packed[0].message, /Packed day/);

    const overlap = dayWarnings([
      item({ id: "a", startTime: "10:00", durationMin: 90, title: "Museum" }),
      item({ id: "b", startTime: "10:30", durationMin: 60, title: "Lunch" }),
    ]);
    assert.match(overlap[0].message, /Lunch.*Museum/);
  });

  it("stays quiet for bare slots", () => {
    assert.deepEqual(dayWarnings([item({ slot: "morning" }), item({ slot: "afternoon" })]), []);
  });
});

describe("dayColor", () => {
  it("gives each of the first eight days a fixed, distinct color", () => {
    assert.equal(DAY_COLORS.length, 8);
    const colors = Array.from({ length: 8 }, (_, i) => dayColor(i).fill);
    assert.equal(new Set(colors).size, 8);
  });

  it("puts later days in neutral gray instead of reusing a hue", () => {
    assert.equal(dayColor(8).fill, OVERFLOW_DAY_COLOR.fill);
    assert.equal(dayColor(20).fill, OVERFLOW_DAY_COLOR.fill);
  });
});
