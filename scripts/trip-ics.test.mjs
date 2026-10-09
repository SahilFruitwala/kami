import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { icsEscape, icsFold, tripToIcs } from "../src/lib/trip-ics.ts";
import { moveWithin } from "../src/lib/trip-days.ts";

const item = (over) => ({
  id: "i1",
  dayIndex: 0,
  slot: "morning",
  title: "Tile Museum",
  place: null,
  url: null,
  notes: null,
  ...over,
});
const trip = (over) => ({
  id: "t1",
  title: "Lisbon",
  destination: "Lisbon, Portugal",
  startDate: "2027-05-14",
  items: [item({})],
  ...over,
});
const NOW = new Date("2027-01-01T10:00:00Z");

describe("icsEscape / icsFold", () => {
  it("escapes separators and newlines", () => {
    assert.equal(icsEscape("a, b; c\\d\ne"), "a\\, b\\; c\\\\d\\ne");
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const line = "SUMMARY:" + "é".repeat(80);
    const folded = icsFold(line);
    for (const part of folded.split("\r\n")) {
      assert.ok(new TextEncoder().encode(part).length <= 75, part);
    }
    assert.equal(folded.replaceAll("\r\n ", ""), line);
  });
});

describe("tripToIcs", () => {
  it("returns null without a start date or plans", () => {
    assert.equal(tripToIcs(trip({ startDate: null }), NOW), null);
    assert.equal(tripToIcs(trip({ items: [] }), NOW), null);
  });

  it("places each plan on its day at its slot's time", () => {
    const ics = tripToIcs(
      trip({
        items: [
          item({ id: "b", dayIndex: 1, slot: "evening", title: "Dinner" }),
          item({ id: "a", dayIndex: 0, slot: "morning" }),
        ],
      }),
      NOW,
    );
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
    assert.match(ics, /DTSTART:20270514T090000\r\nDTEND:20270514T120000/);
    assert.match(ics, /DTSTART:20270515T190000\r\nDTEND:20270515T210000/);
    assert.ok(ics.indexOf("Tile Museum") < ics.indexOf("Dinner"));
  });

  it("ends a night plan after midnight on the next day", () => {
    const ics = tripToIcs(trip({ items: [item({ slot: "night" })] }), NOW);
    assert.match(ics, /DTSTART:20270514T220000\r\nDTEND:20270515T000000/);
  });

  it("falls back to the destination and includes notes and link", () => {
    const ics = tripToIcs(
      trip({ items: [item({ notes: "Closed Mon", url: "https://example.com/x" })] }),
      NOW,
    );
    assert.match(ics, /LOCATION:Lisbon\\, Portugal/);
    assert.match(ics, /DESCRIPTION:Closed Mon\\nhttps:\/\/example.com\/x/);
    assert.match(ics, /URL:https:\/\/example.com\/x/);
  });
});

describe("moveWithin", () => {
  it("swaps with the neighbour", () => {
    assert.deepEqual(moveWithin(["a", "b", "c"], "b", "up"), ["b", "a", "c"]);
    assert.deepEqual(moveWithin(["a", "b", "c"], "b", "down"), ["a", "c", "b"]);
  });

  it("returns null at the ends or for unknown ids", () => {
    assert.equal(moveWithin(["a", "b"], "a", "up"), null);
    assert.equal(moveWithin(["a", "b"], "b", "down"), null);
    assert.equal(moveWithin(["a", "b"], "z", "up"), null);
  });
});
