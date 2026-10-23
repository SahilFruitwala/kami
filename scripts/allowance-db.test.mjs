import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  AllowanceShortError,
  allowanceBalance,
  grantAllowance,
  releaseAllowance,
  reserveAllowance,
} from "../src/lib/allowance-db.server.ts";

/**
 * The allowance ledger against a real Postgres. Opt-in: set TEST_DATABASE_URL
 * to a migrated database you don't mind writing test users into (e.g. the
 * docker-compose one: `pnpm db:up && pnpm db:migrate`). Skips otherwise.
 */
const url = process.env.TEST_DATABASE_URL?.trim();

describe(
  "allowance ledger (Postgres)",
  { skip: url ? false : "set TEST_DATABASE_URL to run" },
  () => {
    let pool;
    let db;
    const userId = `test-allowance-${randomUUID()}`;

    before(async () => {
      pool = new pg.Pool({ connectionString: url, max: 4 });
      db = drizzle(pool);
      await pool.query(
        `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ($1, 'Allowance Test', $2, true, now(), now())`,
        [userId, `${userId}@example.test`],
      );
    });

    after(async () => {
      await pool?.query(`delete from "user" where id = $1`, [userId]);
      await pool?.end();
    });

    it("two narrations started at once can never overspend", async () => {
      await grantAllowance(db, userId, 30_000, "test grant");
      const results = await Promise.allSettled([
        reserveAllowance(db, userId, 20_000, "n1", "first"),
        reserveAllowance(db, userId, 20_000, "n2", "second"),
      ]);
      const ok = results.filter((r) => r.status === "fulfilled");
      const short = results.filter(
        (r) => r.status === "rejected" && r.reason instanceof AllowanceShortError,
      );
      assert.equal(ok.length, 1);
      assert.equal(short.length, 1);
      assert.equal(await allowanceBalance(db, userId), 10_000);
    });

    it("a release returns characters to the balance", async () => {
      await releaseAllowance(db, userId, 5_000, "n1", "deleted unfinished");
      assert.equal(await allowanceBalance(db, userId), 15_000);
    });
  },
);
