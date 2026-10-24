/**
 * Fixed trip briefs that lock the agent instruction contracts.
 * These are the hillclimb fixtures: if a prompt rewrite drops clarify-first,
 * thrifty research, or plan-quality rules, these fail.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTripInstructions,
  needsAgentIntake,
  tripAgentPromptContracts,
  tripPlanningGaps,
} from "../src/lib/trip-agent-prompt.ts";

const blank = {
  title: "Trip",
  destination: "Lisbon, Portugal",
  startDate: null,
  dayCount: 4,
  travelers: null,
  budget: null,
  preferences: null,
  hotels: [],
  items: [],
};

const filled = {
  ...blank,
  title: "Lisbon",
  startDate: "2027-05-14",
  dayCount: 3,
  travelers: 2,
  budget: "€150/night",
  preferences: "food, late starts",
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
    {
      id: "i1",
      dayIndex: 0,
      slot: "morning",
      sort: 0,
      title: "Nata",
      place: "Manteigaria",
    },
  ],
};

/** Named user briefs we care about improving against. */
const FIXTURES = [
  {
    id: "vague-empty-board",
    trip: blank,
    today: "2026-10-23",
    research: true,
    userMessage: "Plan a nice trip for us.",
    expectGaps: [/start date/, /budget/, /pace and interests/, /hotel/, /empty itinerary/],
    expectIntake: true,
  },
  {
    id: "dates-only",
    trip: { ...blank, startDate: "2027-06-01", dayCount: 5, travelers: 2 },
    today: "2026-10-23",
    research: true,
    userMessage: "Find hotels and fill the days.",
    expectGaps: [/budget/, /pace and interests/, /hotel/],
    expectIntake: true,
  },
  {
    id: "ready-to-plan-day",
    trip: filled,
    today: "2026-10-23",
    research: true,
    userMessage: "Plan day 1 around cafés and a short hike.",
    expectGaps: [],
    expectIntake: false,
  },
  {
    id: "no-research-server",
    trip: filled,
    today: "2026-10-23",
    research: false,
    userMessage: "Suggest a quiet evening.",
    expectGaps: [],
    expectIntake: false,
  },
];

describe("trip agent fixtures", () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.id}: keeps clarify / research / plan contracts`, () => {
      const instructions = buildTripInstructions(fixture.trip, {
        today: fixture.today,
        research: fixture.research,
      });
      const contracts = tripAgentPromptContracts(instructions);
      assert.equal(contracts.clarifyFirst, true, "clarify-first");
      assert.equal(contracts.thriftyResearch, true, "thrifty research");
      assert.equal(contracts.planQuality, true, "plan quality");
      assert.equal(contracts.noMapPins, true, "no map pins");

      const gaps = tripPlanningGaps(fixture.trip);
      assert.equal(needsAgentIntake(fixture.trip), fixture.expectIntake);
      if (fixture.expectGaps.length === 0) {
        assert.deepEqual(gaps, []);
      } else {
        for (const re of fixture.expectGaps) {
          assert.ok(
            gaps.some((g) => re.test(g)),
            `expected a gap matching ${re} in ${JSON.stringify(gaps)}`,
          );
        }
        assert.match(instructions, /Open decisions on this trip/);
      }

      // The user brief is documented here so future hillclimbs reuse the same inputs.
      assert.ok(fixture.userMessage.length > 0);
    });
  }
});
