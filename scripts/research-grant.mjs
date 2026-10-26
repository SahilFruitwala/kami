#!/usr/bin/env node
/**
 * Add (or, with a negative number, take back) research credits for one
 * user. The operator's only way to hand out research credits; every user
 * starts at zero.
 *
 *   pnpm research:grant <email> <credits> "<note>"
 *   pnpm research:grant you@example.com 200 "initial"
 *
 * Loads `.env` / `.env.local` like the migrator; needs DATABASE_URL. Prints
 * the user's new balance, never any credentials.
 */
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadDotenv } from "./load-dotenv.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadDotenv(root);

const [email, rawCredits, ...noteParts] = process.argv.slice(2);
const credits = Number(rawCredits);
const note = noteParts.join(" ").trim().slice(0, 200);

if (!email || !Number.isInteger(credits) || credits === 0) {
  console.error(
    'Usage: pnpm research:grant <email> <credits> "<note>"  (credits: non-zero integer)',
  );
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("[research:grant] DATABASE_URL is required.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const found = await client.query(
    'select id from "user" where lower(email) = lower($1) and deleted_at is null',
    [email.trim()],
  );
  if (!found.rows.length) {
    console.error(`[research:grant] No user with email ${email}.`);
    process.exitCode = 1;
  } else {
    const userId = found.rows[0].id;
    await client.query("begin");
    // Same per-user lock the app takes when reserving (src/lib/research-credits-db.server.ts).
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `research-credits:${userId}`,
    ]);
    await client.query(
      "insert into research_credit_entries (id, user_id, kind, credits, note) values ($1, $2, 'grant', $3, $4)",
      [randomUUID(), userId, credits, note || "granted by operator"],
    );
    const total = await client.query(
      "select coalesce(sum(credits), 0)::int as total from research_credit_entries where user_id = $1",
      [userId],
    );
    await client.query("commit");
    console.log(
      `[research:grant] ${credits > 0 ? "Added" : "Removed"} ${Math.abs(credits).toLocaleString()} ` +
        `research credits for ${email}. Available now: ${total.rows[0].total.toLocaleString()}.`,
    );
  }
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error("[research:grant] Failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
