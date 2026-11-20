import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  lastDay,
  planningOpen,
  quarterMode,
  retroDeadline,
  reviewWeek,
} from "../src/lib/compass/rhythm.ts";

const Q3 = { year: 2026, quarter: 3 };
const Q4 = { year: 2026, quarter: 4 };
const Q1 = { year: 2027, quarter: 1 };

describe("weekly review window", () => {
  it("opens Friday for the current week", () => {
    assert.equal(reviewWeek("2026-11-20", 1), "2026-11-16"); // Fri
    assert.equal(reviewWeek("2026-11-22", 1), "2026-11-16"); // Sun
  });
  it("stays open Monday and Tuesday for last week", () => {
    assert.equal(reviewWeek("2026-11-23", 1), "2026-11-16"); // Mon
    assert.equal(reviewWeek("2026-11-24", 1), "2026-11-16"); // Tue
  });
  it("is closed midweek", () => {
    assert.equal(reviewWeek("2026-11-19", 1), null); // Thu
    assert.equal(reviewWeek("2026-11-25", 1), null); // Wed
  });
  it("follows a Sunday week start", () => {
    assert.equal(reviewWeek("2026-11-20", 0), "2026-11-15"); // Fri
    assert.equal(reviewWeek("2026-11-22", 0), "2026-11-15"); // Sun starts a new week, reviews the old one
    assert.equal(reviewWeek("2026-11-24", 0), "2026-11-15"); // Tue
  });
});

describe("planning the next quarter", () => {
  it("opens in the last two weeks", () => {
    assert.equal(lastDay(Q4, 1), "2026-12-27");
    assert.ok(!planningOpen("2026-12-13", 1));
    assert.ok(planningOpen("2026-12-14", 1));
  });
  it("labels quarters by how they relate to today", () => {
    assert.equal(quarterMode(Q3, "2026-11-19", 1), "past");
    assert.equal(quarterMode(Q4, "2026-11-19", 1), "current");
    assert.equal(quarterMode(Q1, "2026-11-19", 1), null);
    assert.equal(quarterMode(Q1, "2026-12-20", 1), "planning");
  });
});

describe("retro deadline", () => {
  it("is two weeks after the quarter's last day", () => {
    assert.equal(retroDeadline(Q4, 1), "2027-01-10");
  });
});
