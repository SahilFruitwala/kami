import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  availableChars,
  canReserve,
  longArticlesEstimate,
  summarizeAllowance,
  unspoken,
} from "../src/lib/allowance.ts";

describe("narration allowance", () => {
  it("everyone starts with nothing", () => {
    assert.equal(availableChars([]), 0);
    assert.equal(canReserve(0, 1), false);
  });

  it("available is the ledger's sum across grants, reservations and releases", () => {
    const entries = [{ chars: 100_000 }, { chars: -30_000 }, { chars: 12_000 }, { chars: -5_000 }];
    assert.equal(availableChars(entries), 77_000);
  });

  it("refuses a reservation larger than what is available", () => {
    assert.equal(canReserve(24_000, 24_001), false);
    assert.equal(canReserve(24_000, 24_000), true);
    assert.equal(canReserve(24_000, 0), false);
  });

  it("an unfinished narration gives back exactly what it hasn't spoken", () => {
    assert.equal(unspoken({ reserved: 30_000, spoken: 12_500 }), 17_500);
  });

  it("a finished narration gives back nothing", () => {
    assert.equal(unspoken({ reserved: 30_000, spoken: 30_000 }), 0);
    assert.equal(unspoken({ reserved: 30_000, spoken: 31_000 }), 0);
  });

  it("reports what unfinished narrations still hold", () => {
    const summary = summarizeAllowance(
      [{ chars: 100_000 }, { chars: -30_000 }, { chars: -10_000 }],
      [
        { reserved: 30_000, spoken: 10_000 },
        { reserved: 10_000, spoken: 0 },
      ],
    );
    assert.deepEqual(summary, { available: 60_000, reserved: 30_000 });
  });

  it("estimates in long articles", () => {
    assert.equal(longArticlesEstimate(0), "less than one long article");
    assert.equal(longArticlesEstimate(30_000), "about one long article");
    assert.equal(longArticlesEstimate(312_400), "≈ 13 long articles");
  });
});
