import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb, skipWithoutDb, testUser } from "../support/db.mjs";

describe("research credit ledger", { skip: skipWithoutDb }, () => {
  let user;
  let ledger;
  let rdb;
  let db;
  let topic;

  const newRun = () =>
    rdb.createRun(db, user.id, topic.id, {
      kind: "discover",
      depth: "quick",
      input: { seed: "x" },
    });

  before(async () => {
    ledger = await import("@/lib/research-credits-db.server.ts");
    rdb = await import("@/lib/research-db.server.ts");
    db = await (await import("@/lib/db.server")).getDb();
    user = await testUser();
    topic = await rdb.createTopic(db, user.id, "credits");
  });

  after(async () => {
    await user?.cleanup();
    await closeDb();
  });

  it("everyone starts with nothing, and a run can't start without credits", async () => {
    assert.equal(await ledger.researchCreditBalance(db, user.id), 0);
    const run = await newRun();
    await assert.rejects(
      ledger.reserveRunCredits(db, user.id, run.id, 30, "start"),
      ledger.ResearchCreditsShortError,
    );
  });

  it("two runs started at once can never overspend", async () => {
    await ledger.grantResearchCredits(db, user.id, 50, "test grant");
    const [a, b] = await Promise.all([newRun(), newRun()]);
    const results = await Promise.allSettled([
      ledger.reserveRunCredits(db, user.id, a.id, 30, "first"),
      ledger.reserveRunCredits(db, user.id, b.id, 30, "second"),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      results.filter(
        (r) => r.status === "rejected" && r.reason instanceof ledger.ResearchCreditsShortError,
      ).length,
      1,
    );
    assert.equal(await ledger.researchCreditBalance(db, user.id), 20);
  });

  it("settling charges the run once and returns the rest of its budget", async () => {
    await ledger.grantResearchCredits(db, user.id, 30, "top up");
    const before = await ledger.researchCreditBalance(db, user.id);
    const run = await newRun();
    await ledger.reserveRunCredits(db, user.id, run.id, 30, "start");
    assert.equal((await rdb.getRun(db, user.id, run.id)).budgetCredits, 30);
    assert.equal(await ledger.researchCreditBalance(db, user.id), before - 30);

    assert.equal(await ledger.settleRunCredits(db, user.id, run.id, 12, "end"), 12);
    assert.equal(await ledger.settleRunCredits(db, user.id, run.id, 12, "end again"), null);
    assert.equal((await rdb.getRun(db, user.id, run.id)).chargedCredits, 12);
    assert.equal(await ledger.researchCreditBalance(db, user.id), before - 12);
  });

  it("a charge over the budget is capped at the budget", async () => {
    await ledger.grantResearchCredits(db, user.id, 10, "top up");
    const before = await ledger.researchCreditBalance(db, user.id);
    const run = await newRun();
    await ledger.reserveRunCredits(db, user.id, run.id, 10, "start");
    assert.equal(await ledger.settleRunCredits(db, user.id, run.id, 99, "end"), 10);
    assert.equal(await ledger.researchCreditBalance(db, user.id), before - 10);
  });

  it("lists the newest entries first", async () => {
    const entries = await ledger.recentResearchCreditEntries(db, user.id, 3);
    assert.equal(entries.length, 3);
    assert.equal(entries[0].kind, "reserve");
    assert.ok(entries[0].createdAt >= entries[1].createdAt);
  });
});
