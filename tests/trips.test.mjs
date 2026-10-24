import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareItems,
  dayDate,
  daysBetween,
  endDate,
  formatDay,
  formatRange,
  groupByDay,
  lastUsedDay,
  parseIsoDate,
  TRIP_STATUSES,
  TRIP_STATUS_LABEL,
} from "../src/lib/trip-days.ts";
import { updateTripInput } from "../src/lib/api/schemas/trips.ts";

describe("parseIsoDate", () => {
  it("accepts real calendar dates", () => {
    assert.equal(parseIsoDate("2027-05-14"), Date.UTC(2027, 4, 14));
    assert.equal(parseIsoDate("2028-02-29"), Date.UTC(2028, 1, 29));
  });

  it("rejects malformed and rolled-over dates", () => {
    for (const bad of [
      "2027-02-30",
      "2027-13-01",
      "2027-5-14",
      "14/05/2027",
      "",
      "2027-05-14T00:00",
    ]) {
      assert.equal(parseIsoDate(bad), null, bad);
    }
  });
});

describe("dayDate / endDate", () => {
  it("counts days from the start date across month and year ends", () => {
    assert.equal(dayDate("2027-05-14", 0), "2027-05-14");
    assert.equal(dayDate("2027-05-30", 3), "2027-06-02");
    assert.equal(dayDate("2027-12-31", 1), "2028-01-01");
  });

  it("is inclusive of the first day", () => {
    assert.equal(endDate("2027-05-14", 4), "2027-05-17");
    assert.equal(endDate("2027-05-14", 1), "2027-05-14");
  });

  it("returns null without a usable start date", () => {
    assert.equal(dayDate(null, 2), null);
    assert.equal(endDate("not-a-date", 3), null);
  });
});

describe("daysBetween", () => {
  it("returns the inclusive day count", () => {
    assert.equal(daysBetween("2027-05-14", "2027-05-17"), 4);
    assert.equal(daysBetween("2027-05-14", "2027-05-14"), 1);
    // Spans a DST change in most zones; UTC math keeps it exact.
    assert.equal(daysBetween("2027-03-27", "2027-03-29"), 3);
  });

  it("rejects reversed or invalid ranges", () => {
    assert.equal(daysBetween("2027-05-17", "2027-05-14"), null);
    assert.equal(daysBetween("2027-05-14", "2027-02-30"), null);
  });
});

describe("formatting", () => {
  it("labels a day without shifting it by time zone", () => {
    assert.equal(formatDay("2027-05-14", "en-US"), "Fri, May 14");
  });

  it("describes a range, or just the length without dates", () => {
    assert.equal(formatRange(null, 3), "3 days");
    assert.equal(formatRange(null, 1), "1 day");
    assert.equal(formatRange("2027-05-14", 4, "en-US"), "May 14, 2027 – May 17, 2027 · 4 days");
  });
});

describe("itinerary order", () => {
  const item = (id, dayIndex, slot, sort = 0) => ({ id, dayIndex, slot, sort });

  it("orders by day, then morning → night, then sort", () => {
    const items = [
      item("e", 1, "morning"),
      item("d", 0, "night"),
      item("c", 0, "evening", 1),
      item("b", 0, "evening", 0),
      item("a", 0, "morning"),
    ];
    assert.deepEqual(
      [...items].sort(compareItems).map((i) => i.id),
      ["a", "b", "c", "d", "e"],
    );
  });

  it("groups into exactly dayCount days and drops out-of-range items", () => {
    const days = groupByDay(
      [item("x", 2, "morning"), item("y", 0, "evening"), item("z", 5, "morning")],
      3,
    );
    assert.equal(days.length, 3);
    assert.deepEqual(
      days.map((d) => d.map((i) => i.id)),
      [["y"], [], ["x"]],
    );
  });

  it("finds the last day that still has plans", () => {
    assert.equal(lastUsedDay([]), -1);
    assert.equal(lastUsedDay([{ dayIndex: 0 }, { dayIndex: 3 }, { dayIndex: 1 }]), 3);
  });
});

describe("trip status", () => {
  it("has four statuses, each with a label", () => {
    assert.deepEqual([...TRIP_STATUSES], ["planning", "booked", "done", "archived"]);
    for (const s of TRIP_STATUSES) assert.ok(TRIP_STATUS_LABEL[s], s);
  });

  it("accepts any status in a trip patch and rejects unknown ones", () => {
    for (const status of TRIP_STATUSES) {
      assert.equal(updateTripInput.parse({ status }).status, status);
    }
    assert.equal(updateTripInput.parse({}).status, undefined);
    assert.throws(() => updateTripInput.parse({ status: "cancelled" }));
  });
});
