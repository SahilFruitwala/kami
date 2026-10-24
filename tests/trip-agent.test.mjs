import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTripInstructions,
  readableUrlKey,
  readableUrlsIn,
  tripPlanningGaps,
  tripSnapshot,
} from "../src/lib/trip-agent-prompt.ts";

const trip = {
  title: "Lisbon",
  destination: "Lisbon, Portugal",
  startDate: "2027-05-14",
  dayCount: 3,
  travelers: 2,
  budget: "€150/night",
  preferences: "food, tiles",
  hotels: [
    {
      id: "h1",
      name: "Chiado Courtyard",
      area: "Chiado",
      status: "chosen",
      priceNote: "≈ €160",
      url: null,
    },
  ],
  items: [
    { id: "i2", dayIndex: 0, slot: "evening", sort: 0, title: "Dinner", place: null },
    { id: "i1", dayIndex: 0, slot: "morning", sort: 0, title: "Nata", place: "Manteigaria" },
    { id: "i3", dayIndex: 2, slot: "morning", sort: 0, title: "Sintra", place: null },
  ],
};

describe("trip snapshot", () => {
  it("numbers days from 1 with dates and ordered items", () => {
    const snap = tripSnapshot(trip);
    assert.equal(snap.endDate, "2027-05-16");
    assert.deepEqual(
      snap.itinerary.map((d) => [d.day, d.date, d.items.map((i) => i.id)]),
      [
        [1, "2027-05-14", ["i1", "i2"]],
        [2, "2027-05-15", []],
        [3, "2027-05-16", ["i3"]],
      ],
    );
    assert.deepEqual(snap.hotels[0], {
      id: "h1",
      name: "Chiado Courtyard",
      area: "Chiado",
      status: "chosen",
      price: "≈ €160",
      url: null,
    });
  });

  it("adds times and day warnings without map pins", () => {
    const snap = tripSnapshot({
      ...trip,
      items: [
        {
          id: "a",
          dayIndex: 0,
          slot: "morning",
          sort: 0,
          title: "Rossio",
          place: "Rossio",
          startTime: "10:00",
          durationMin: 60,
        },
        {
          id: "b",
          dayIndex: 0,
          slot: "afternoon",
          sort: 0,
          title: "Lunch",
          place: null,
          startTime: "10:15",
          durationMin: 45,
        },
      ],
    });
    const [a, b] = snap.itinerary[0].items;
    assert.deepEqual([a.start, a.minutes, a.place], ["10:00", 60, "Rossio"]);
    assert.equal(b.start, "10:15");
    assert.match(snap.itinerary[0].warnings[0], /Lunch.*Rossio/);
    assert.equal(a.pinned, undefined);
    assert.equal(a.kmFromPrevious, undefined);
  });

  it("builds instructions with clarify, thrifty research, and plan quality", () => {
    const withResearch = buildTripInstructions(trip, { today: "2026-10-08", research: true });
    assert.match(withResearch, /Today is 2026-10-08\./);
    assert.match(withResearch, /Clarify/);
    assert.match(withResearch, /highest-leverage/);
    assert.match(withResearch, /Research \(thrifty\)/);
    assert.match(withResearch, /Prefer web_search/);
    assert.match(withResearch, /2–4 real stops/);
    assert.match(withResearch, /web_search/);
    assert.match(withResearch, /untrusted data/);
    assert.match(withResearch, /"destination":"Lisbon, Portugal"/);
    assert.doesNotMatch(withResearch, /locate_places|lat\/lng|Nominatim/i);

    const without = buildTripInstructions(trip, { today: "2026-10-08", research: false });
    assert.match(without, /Web research is not available/);
    assert.match(without, /Clarify/);
    assert.doesNotMatch(without, /use web_search/);
  });
});

describe("tripPlanningGaps", () => {
  it("lists missing decision fields that shape hotels and days", () => {
    assert.deepEqual(
      tripPlanningGaps({
        ...trip,
        startDate: null,
        travelers: null,
        budget: null,
        preferences: null,
        hotels: [],
        items: [],
      }),
      [
        "start date (and whether the day count is right)",
        "number of travellers",
        "budget (per night or for the trip)",
        "pace and interests (must-sees, food, walking vs transit, early or late starts, anything to avoid)",
        "preferred hotel area or a hotel shortlist",
        "what to prioritise on the empty itinerary (neighbourhoods, themes, or must-dos)",
      ],
    );
  });

  it("is empty when the board already has the basics", () => {
    assert.deepEqual(tripPlanningGaps(trip), []);
  });

  it("surfaces open decisions inside the instructions", () => {
    const thin = {
      ...trip,
      budget: null,
      preferences: "",
      hotels: [],
    };
    const text = buildTripInstructions(thin, { today: "2026-10-08", research: true });
    assert.match(text, /Open decisions on this trip/);
    assert.match(text, /budget/);
    assert.match(text, /preferred hotel area/);
  });
});

describe("read_page allowlist keys", () => {
  it("normalizes http(s) URLs and drops fragments", () => {
    assert.equal(readableUrlKey(" https://Example.com/a#top "), "https://example.com/a");
    assert.equal(readableUrlKey("javascript:alert(1)"), null);
    assert.equal(readableUrlKey("not a url"), null);
  });

  it("finds links the user wrote, trimming punctuation", () => {
    assert.deepEqual(
      readableUrlsIn("Look at https://hotel.example/rooms. Also (https://b.example/x?y=1), thanks"),
      ["https://hotel.example/rooms", "https://b.example/x?y=1"],
    );
  });

  it("keeps a page-injected exfil URL distinct from the trusted one", () => {
    const trusted = new Set(readableUrlsIn("https://hotel.example/rooms"));
    assert.ok(!trusted.has(readableUrlKey("https://hotel.example/rooms?leak=2026-05-01")));
  });
});
