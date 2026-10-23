import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb, skipWithoutDb, testUser } from "../support/db.mjs";

describe("narration allowance ledger", { skip: skipWithoutDb }, () => {
  let user;
  let ledger;
  let db;

  before(async () => {
    ledger = await import("@/lib/allowance-db.server.ts");
    db = await (await import("@/lib/db.server")).getDb();
    user = await testUser();
  });

  after(async () => {
    await user?.cleanup();
    await closeDb();
  });

  it("everyone starts with nothing", async () => {
    assert.equal(await ledger.allowanceBalance(db, user.id), 0);
  });

  it("two narrations started at once can never overspend", async () => {
    await ledger.grantAllowance(db, user.id, 30_000, "test grant");
    const results = await Promise.allSettled([
      ledger.reserveAllowance(db, user.id, 20_000, "n1", "first"),
      ledger.reserveAllowance(db, user.id, 20_000, "n2", "second"),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const short = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof ledger.AllowanceShortError,
    );
    assert.equal(ok.length, 1);
    assert.equal(short.length, 1);
    assert.equal(await ledger.allowanceBalance(db, user.id), 10_000);
  });

  it("a release returns characters to the balance", async () => {
    await ledger.releaseAllowance(db, user.id, 5_000, "n1", "deleted unfinished");
    assert.equal(await ledger.allowanceBalance(db, user.id), 15_000);
    const entries = await ledger.recentAllowanceEntries(db, user.id);
    assert.deepEqual(
      entries.map((e) => e.kind),
      ["release", "reserve", "grant"],
    );
  });
});
