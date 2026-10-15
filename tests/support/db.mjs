/**
 * Helpers for tests that need Postgres. They run only when TEST_DATABASE_URL
 * points at a migrated database (CI provides one; locally:
 * `TEST_DATABASE_URL=postgres://… pnpm test` after `pnpm db:migrate`).
 */
import { randomUUID } from "node:crypto";

export const dbUrl = process.env.TEST_DATABASE_URL;
export const skipWithoutDb = dbUrl ? false : "TEST_DATABASE_URL not set";
if (dbUrl) process.env.DATABASE_URL = dbUrl;

/** Create a throwaway user; returns its id and a cleanup that cascades its rows. */
export async function testUser() {
  const { getDb } = await import("@/lib/db.server");
  const { sql } = await import("drizzle-orm");
  const db = await getDb();
  const id = `test_${randomUUID()}`;
  await db.execute(
    sql`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
        values (${id}, 'Test', ${`${id}@example.test`}, true, now(), now())`,
  );
  return {
    id,
    cleanup: () => db.execute(sql`delete from "user" where id = ${id}`),
  };
}

/** Close the shared pool so `node --test` can exit. */
export async function closeDb() {
  const pool = globalThis.__pgPool__;
  if (pool) {
    await pool.end();
    globalThis.__pgPool__ = undefined;
    globalThis.__drizzleDb__ = undefined;
  }
}
