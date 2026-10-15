import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FEED_MAX_BACKOFF_MIN,
  FEED_MAX_INTERVAL_MIN,
  FEED_MIN_INTERVAL_MIN,
  errorBackoffMinutes,
  maxAgeMinutes,
  nextInterval,
  retryAfterMinutes,
  withJitter,
} from "../src/lib/feed-schedule.ts";

describe("feed schedule", () => {
  it("tightens for active feeds and relaxes for quiet ones, within bounds", () => {
    assert.equal(nextInterval(120, 3, null), 60);
    assert.equal(nextInterval(40, 3, null), FEED_MIN_INTERVAL_MIN);
    assert.equal(nextInterval(60, 0, null), 90);
    assert.equal(nextInterval(FEED_MAX_INTERVAL_MIN, 0, null), FEED_MAX_INTERVAL_MIN);
  });

  it("only lets publisher hints slow polling down", () => {
    assert.equal(nextInterval(60, 5, 240), 240);
    assert.equal(nextInterval(600, 0, 5), FEED_MAX_INTERVAL_MIN);
    assert.equal(nextInterval(60, 5, 99_999), FEED_MAX_INTERVAL_MIN);
  });

  it("backs off exponentially on errors, capped", () => {
    assert.equal(errorBackoffMinutes(1), 30);
    assert.equal(errorBackoffMinutes(3), 120);
    assert.equal(errorBackoffMinutes(50), FEED_MAX_BACKOFF_MIN);
  });

  it("jitters within ±10%", () => {
    assert.equal(
      withJitter(100, () => 0),
      90,
    );
    assert.equal(
      withJitter(100, () => 1),
      110,
    );
    assert.equal(
      withJitter(0, () => 0.5),
      1,
    );
  });

  it("parses Retry-After and max-age", () => {
    assert.equal(retryAfterMinutes("120"), 2);
    assert.equal(retryAfterMinutes(new Date(10 * 60_000).toUTCString(), 0), 10);
    assert.equal(retryAfterMinutes("soon"), null);
    assert.equal(maxAgeMinutes("public, max-age=3600"), 60);
    assert.equal(maxAgeMinutes("no-cache"), null);
  });
});
