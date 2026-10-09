import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGeocodeUrl, parseGeocodeResponse } from "../src/lib/geocode.server.ts";
import {
  dayHops,
  dayWarnings,
  formatDuration,
  haversineKm,
  itemTiming,
  parseTime,
  slotForTime,
  travelEstimate,
} from "../src/lib/trip-route.ts";
import { tripToIcs } from "../src/lib/trip-ics.ts";
import { DAY_COLORS, dayColor, OVERFLOW_DAY_COLOR } from "../src/lib/trip-colors.ts";

const item = (over) => ({
  id: "i",
  slot: "morning",
  title: "Stop",
  lat: null,
  lng: null,
  startTime: null,
  durationMin: null,
  ...over,
});

// Lisbon landmarks, roughly.
const ROSSIO = { lat: 38.7139, lng: -9.1394 };
const CARMO = { lat: 38.7121, lng: -9.1405 }; // ~200 m away
const BELEM = { lat: 38.6916, lng: -9.216 }; // ~7 km away
const SINTRA = { lat: 38.7976, lng: -9.3906 }; // ~23 km away

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

describe("distances", () => {
  it("measures great-circle distance", () => {
    assert.ok(Math.abs(haversineKm(ROSSIO, CARMO) - 0.21) < 0.05);
    assert.ok(Math.abs(haversineKm(ROSSIO, SINTRA) - 23) < 2);
    assert.equal(haversineKm(ROSSIO, ROSSIO), 0);
  });

  it("walks short hops and rides longer ones", () => {
    assert.equal(travelEstimate(0.8).mode, "walk");
    assert.equal(travelEstimate(5).mode, "ride");
    assert.ok(travelEstimate(5).minutes > travelEstimate(0.8).minutes - 20);
  });

  it("measures hops between pinned stops only", () => {
    const hops = dayHops([
      item({ id: "a", ...ROSSIO }),
      item({ id: "b" }), // unpinned: skipped
      item({ id: "c", ...BELEM }),
    ]);
    assert.equal(hops[0], null);
    assert.equal(hops[1], null);
    assert.ok(hops[2].km > 6 && hops[2].km < 8);
  });
});

describe("dayWarnings", () => {
  it("stays quiet for a day of bare slots", () => {
    assert.deepEqual(dayWarnings([item({}), item({ slot: "evening" })]), []);
  });

  it("flags long hops", () => {
    const w = dayWarnings([item({ ...ROSSIO }), item({ title: "Pena Palace", ...SINTRA })]);
    assert.deepEqual(
      w.map((x) => x.kind),
      ["long-hop"],
    );
    assert.match(w[0].message, /Pena Palace/);
  });

  it("flags packed days", () => {
    const w = dayWarnings([
      item({ durationMin: 400 }),
      item({ slot: "afternoon", durationMin: 400 }),
    ]);
    assert.ok(w.some((x) => x.kind === "busy"));
  });

  it("flags timed plans that overlap, counting travel", () => {
    const w = dayWarnings([
      item({ title: "Museum", startTime: "10:00", durationMin: 120, ...ROSSIO }),
      item({ title: "Lunch", startTime: "12:05", ...BELEM }),
    ]);
    assert.ok(w.some((x) => x.kind === "overlap" && /Lunch/.test(x.message)));
    const ok = dayWarnings([
      item({ title: "Museum", startTime: "10:00", durationMin: 120 }),
      item({ title: "Lunch", startTime: "12:30" }),
    ]);
    assert.deepEqual(ok, []);
  });
});

describe("geocoder", () => {
  it("builds a Nominatim search URL", () => {
    const url = new URL(buildGeocodeUrl("https://nominatim.example", "Rossio, Lisbon"));
    assert.equal(url.pathname, "/search");
    assert.equal(url.searchParams.get("q"), "Rossio, Lisbon");
    assert.equal(url.searchParams.get("limit"), "1");
  });

  it("reads the first match and rejects junk", () => {
    assert.deepEqual(parseGeocodeResponse([{ lat: "38.71", lon: "-9.14" }]), {
      lat: 38.71,
      lng: -9.14,
    });
    assert.equal(parseGeocodeResponse([]), null);
    assert.equal(parseGeocodeResponse({ error: "x" }), null);
    assert.equal(parseGeocodeResponse([{ lat: "abc", lon: "1" }]), null);
    assert.equal(parseGeocodeResponse([{ lat: "91", lon: "0" }]), null);
  });
});

describe("tripToIcs with times", () => {
  it("uses a plan's own start time and duration", () => {
    const ics = tripToIcs(
      {
        id: "t",
        title: "Lisbon",
        destination: "Lisbon",
        startDate: "2027-05-14",
        items: [
          {
            id: "a",
            dayIndex: 1,
            slot: "afternoon",
            title: "Tram 28",
            place: null,
            url: null,
            notes: null,
            startTime: "15:45",
            durationMin: 90,
          },
        ],
      },
      new Date("2027-01-01T00:00:00Z"),
    );
    assert.match(ics, /DTSTART:20270515T154500\r\nDTEND:20270515T171500/);
  });
});

describe("dayColor", () => {
  it("gives each of the first eight days a fixed, distinct color", () => {
    const fills = DAY_COLORS.map((_, i) => dayColor(i).fill);
    assert.equal(new Set(fills).size, 8);
    assert.equal(dayColor(0).fill, "#2a78d6");
  });

  it("puts later days in neutral gray instead of reusing a hue", () => {
    assert.deepEqual(dayColor(8), OVERFLOW_DAY_COLOR);
    assert.deepEqual(dayColor(29), OVERFLOW_DAY_COLOR);
  });
});
