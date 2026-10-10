import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTripInstructions,
  readableUrlKey,
  readableUrlsIn,
  tripSnapshot,
} from "../src/lib/trip-agent-prompt.ts";
import {
  DEFAULT_TRIP_MODELS,
  parseModelId,
  parseModelList,
  pickModel,
} from "../src/lib/trip-models.ts";

describe("trip models", () => {
  it("parses provider:model ids, keeping slashes in the model name", () => {
    assert.deepEqual(parseModelId(" openrouter:anthropic/claude-haiku-5.5 "), {
      id: "openrouter:anthropic/claude-haiku-5.5",
      provider: "openrouter",
      model: "anthropic/claude-haiku-5.5",
      label: "anthropic/claude-haiku-5.5 · OpenRouter",
    });
    assert.equal(parseModelId("Google:gemini-3.8-flash")?.id, "google:gemini-3.8-flash");
  });

  it("rejects unknown providers and blank models", () => {
    for (const bad of ["openai:gpt", "gemini-3.8-flash", "google:", ":model", ""]) {
      assert.equal(parseModelId(bad), null, bad);
    }
  });

  it("defaults to Google first, then OpenRouter", () => {
    assert.deepEqual(
      parseModelList(undefined).map((m) => m.id),
      ["google:gemini-3.8-flash", "openrouter:anthropic/claude-haiku-5.5"],
    );
    assert.deepEqual(parseModelList("  "), parseModelList(DEFAULT_TRIP_MODELS));
  });

  it("reads an override list, dropping invalid and duplicate entries", () => {
    assert.deepEqual(
      parseModelList("openrouter:a/b, bogus, google:g, openrouter:a/b").map((m) => m.id),
      ["openrouter:a/b", "google:g"],
    );
  });

  it("honours a usable requested model and falls back otherwise", () => {
    const models = parseModelList(undefined);
    const both = () => true;
    const googleOnly = (p) => p === "google";
    assert.equal(
      pickModel(models, both, "openrouter:anthropic/claude-haiku-5.5")?.provider,
      "openrouter",
    );
    assert.equal(
      pickModel(models, googleOnly, "openrouter:anthropic/claude-haiku-5.5")?.provider,
      "google",
    );
    assert.equal(pickModel(models, both, "google:not-on-the-menu")?.id, "google:gemini-3.8-flash");
    assert.equal(pickModel(models, (p) => p === "openrouter")?.provider, "openrouter");
    assert.equal(
      pickModel(models, () => false),
      null,
    );
  });
});

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
      pinned: false,
    });
  });

  it("adds times, pins, distances and day warnings", () => {
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
          lat: 38.7139,
          lng: -9.1394,
          startTime: "10:00",
          durationMin: 60,
        },
        {
          id: "b",
          dayIndex: 0,
          slot: "afternoon",
          sort: 0,
          title: "Pena Palace",
          place: "Sintra",
          lat: 38.7876,
          lng: -9.3906,
        },
      ],
    });
    const [a, b] = snap.itinerary[0].items;
    assert.deepEqual(
      [a.start, a.minutes, a.pinned, a.kmFromPrevious],
      ["10:00", 60, true, undefined],
    );
    assert.ok(b.kmFromPrevious > 20 && b.kmFromPrevious < 25);
    assert.match(snap.itinerary[0].warnings[0], /Long trip to “Pena Palace”/);
    assert.equal(snap.itinerary[1].warnings, undefined);
  });

  it("builds instructions with today, the trip, and research rules", () => {
    const withResearch = buildTripInstructions(trip, { today: "2026-10-08", research: true });
    assert.match(withResearch, /Today is 2026-10-08\./);
    assert.match(withResearch, /web_search/);
    assert.match(withResearch, /untrusted data/);
    assert.match(withResearch, /"destination":"Lisbon, Portugal"/);

    const without = buildTripInstructions(trip, { today: "2026-10-08", research: false });
    assert.match(without, /Web research is not available/);
    assert.doesNotMatch(without, /use web_search/);
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
