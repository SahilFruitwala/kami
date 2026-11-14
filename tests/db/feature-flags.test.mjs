import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb, skipWithoutDb, testUser } from "../support/db.mjs";

describe("user AI feature flag", { skip: skipWithoutDb }, () => {
  let user;
  let other;
  let flags;
  let db;
  let schema;
  let eq;

  before(async () => {
    ({ eq } = await import("drizzle-orm"));
    schema = await import("@/lib/schema.ts");
    flags = await import("@/lib/feature-flags.server.ts");
    db = await (await import("@/lib/db.server")).getDb();
    user = await testUser();
    other = await testUser();
  });

  after(async () => {
    await user?.cleanup();
    await other?.cleanup();
    await closeDb();
  });

  it("starts off: no row means the user cannot use AI", async () => {
    assert.equal(await flags.userHasAiFlag(user.id), false);
  });

  it("turning the flag on does not grant a neighbour", async () => {
    await flags.setUserAiFlag(user.id, true);
    assert.equal(await flags.userHasAiFlag(user.id), true);
    assert.equal(await flags.userHasAiFlag(other.id), false);
  });

  it("turning it off again leaves sharing as it was", async () => {
    await db
      .update(schema.userFeatureFlags)
      .set({ sharing: true })
      .where(eq(schema.userFeatureFlags.userId, user.id));
    await flags.setUserAiFlag(user.id, false);
    const [row] = await db
      .select()
      .from(schema.userFeatureFlags)
      .where(eq(schema.userFeatureFlags.userId, user.id));
    assert.equal(row.ai, false);
    assert.equal(row.sharing, true);
  });
});
