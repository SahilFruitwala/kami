import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRetryAfter } from "../src/lib/firecrawl.server.ts";
import {
  MAX_RATE_LIMIT_WAIT_MS,
  RATE_LIMIT_WAITS_MS,
  rateLimitWait,
} from "../src/lib/research/backoff.ts";
import { DEPTH_BUDGETS } from "../src/lib/research/run-engine.ts";
import { DEPTH_LIMITS } from "../src/lib/research/discover.ts";
import { searchCreditCost } from "../src/lib/firecrawl.server.ts";

describe("rate-limit backoff", () => {
  it("waits on a schedule, then gives up", () => {
    assert.deepEqual(
      [0, 1, 2, 3].map((n) => rateLimitWait(n)),
      [...RATE_LIMIT_WAITS_MS, null],
    );
  });

  it("follows Retry-After, within limits", () => {
    assert.equal(rateLimitWait(0, 8_000), 8_000);
    assert.equal(rateLimitWait(0, 120_000), MAX_RATE_LIMIT_WAIT_MS);
    assert.equal(rateLimitWait(0, 0), 1_000);
    assert.equal(rateLimitWait(3, 1_000), null);
  });

  it("keeps a whole unit's waits under 45 seconds", () => {
    assert.ok(RATE_LIMIT_WAITS_MS.reduce((a, b) => a + b, 0) <= 45_000);
  });
});

describe("parseRetryAfter", () => {
  it("reads seconds and HTTP dates", () => {
    assert.equal(parseRetryAfter("12"), 12_000);
    const now = Date.UTC(2026, 9, 26, 12, 0, 0);
    assert.equal(parseRetryAfter("Mon, 26 Oct 2026 12:00:20 GMT", now), 20_000);
    assert.equal(parseRetryAfter(null), undefined);
    assert.equal(parseRetryAfter("soon"), undefined);
    assert.equal(parseRetryAfter("-3"), undefined);
  });
});

describe("Quick budget", () => {
  it("leaves room to read pages after a full plan of searches", () => {
    const { maxQueries, resultsPerQuery, pagesToRead } = DEPTH_LIMITS.quick;
    const searches = maxQueries * searchCreditCost(resultsPerQuery);
    assert.equal(DEPTH_BUDGETS.quick, 45);
    assert.ok(DEPTH_BUDGETS.quick - searches >= pagesToRead, "every picked page can be read");
  });
});
