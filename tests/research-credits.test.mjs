import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { researchConfig } from "../src/lib/research-config.server.ts";
import {
  availableCredits,
  canReserveCredits,
  chargedCredits,
  unspentCredits,
} from "../src/lib/research/credits.ts";

describe("research credits", () => {
  it("everyone starts with nothing", () => {
    assert.equal(availableCredits([]), 0);
    assert.equal(canReserveCredits(0, 1), false);
  });

  it("available is the ledger's sum across grants, reserves and releases", () => {
    assert.equal(availableCredits([{ credits: 200 }, { credits: -30 }, { credits: 12 }]), 182);
  });

  it("refuses a budget larger than what is available, or not a positive whole number", () => {
    assert.equal(canReserveCredits(30, 31), false);
    assert.equal(canReserveCredits(30, 30), true);
    assert.equal(canReserveCredits(30, 0), false);
    assert.equal(canReserveCredits(30, 2.5), false);
  });

  it("charges Firecrawl credits plus tokens rounded up to a whole credit", () => {
    const spend = { firecrawlCredits: 14, tokensIn: 30_000, tokensOut: 1 };
    assert.equal(chargedCredits(spend, 30, 20_000), 16);
    assert.equal(chargedCredits({ firecrawlCredits: 0, tokensIn: 0, tokensOut: 0 }, 30, 20_000), 0);
  });

  it("never charges more than the budget", () => {
    const spend = { firecrawlCredits: 40, tokensIn: 0, tokensOut: 0 };
    assert.equal(chargedCredits(spend, 30, 20_000), 30);
  });

  it("returns exactly the unspent part of the budget", () => {
    assert.equal(unspentCredits(30, 16), 14);
    assert.equal(unspentCredits(30, 30), 0);
    assert.equal(unspentCredits(30, 45), 0);
  });
});

describe("research config", () => {
  const base = { FIRECRAWL_API_KEY: "fc-key" };

  it("is off without Firecrawl or an AI model", () => {
    assert.equal(researchConfig({}, true), null);
    assert.equal(researchConfig(base, false), null);
  });

  it("works locally without a run secret, with defaults", () => {
    const config = researchConfig(base, true);
    assert.equal(config?.tokensPerCredit, 20_000);
    assert.equal(config?.maxPageChars, 60_000);
    assert.equal(config?.runSecret, null);
  });

  it("needs a 16+ character run secret on Vercel", () => {
    assert.equal(
      researchConfig({ ...base, VERCEL: "1", RESEARCH_RUN_SECRET: "short" }, true),
      null,
    );
    const config = researchConfig(
      { ...base, VERCEL: "1", RESEARCH_RUN_SECRET: "x".repeat(16) },
      true,
    );
    assert.equal(config?.runSecret, "x".repeat(16));
  });

  it("ignores invalid numbers and keeps the defaults", () => {
    const config = researchConfig(
      { ...base, RESEARCH_TOKENS_PER_CREDIT: "-5", RESEARCH_MAX_PAGE_CHARS: "lots" },
      true,
    );
    assert.equal(config?.tokensPerCredit, 20_000);
    assert.equal(config?.maxPageChars, 60_000);
    assert.equal(
      researchConfig({ ...base, RESEARCH_TOKENS_PER_CREDIT: "5000" }, true)?.tokensPerCredit,
      5000,
    );
  });
});
