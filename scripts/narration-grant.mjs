#!/usr/bin/env node
/**
 * Add (or, with a negative number, take back) narration allowance for one
 * user. The operator's only way to hand out allowance; every user starts at
 * zero.
 *
 *   pnpm narration:grant <email> <chars> "<note>"
 *   pnpm narration:grant you@example.com 500000 "initial"
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

const [email, rawChars, ...noteParts] = process.argv.slice(2);
const chars = Number(rawChars);
const note = noteParts.join(" ").trim().slice(0, 200);

if (!email || !Number.isInteger(chars) || chars === 0) {
  console.error('Usage: pnpm narration:grant <email> <chars> "<note>"  (chars: non-zero integer)');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("[narration:grant] DATABASE_URL is required.");
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
    console.error(`[narration:grant] No user with email ${email}.`);
    process.exitCode = 1;
  } else {
    const userId = found.rows[0].id;
    await client.query("begin");
    // Same per-user lock the app takes when reserving (src/lib/allowance-db.server.ts).
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `allowance:${userId}`,
    ]);
    await client.query(
      "insert into allowance_entries (id, user_id, kind, chars, note) values ($1, $2, 'grant', $3, $4)",
      [randomUUID(), userId, chars, note || "granted by operator"],
    );
    const total = await client.query(
      "select coalesce(sum(chars), 0)::int as total from allowance_entries where user_id = $1",
      [userId],
    );
    await client.query("commit");
    console.log(
      `[narration:grant] ${chars > 0 ? "Added" : "Removed"} ${Math.abs(chars).toLocaleString()} ` +
        `characters for ${email}. Available now: ${total.rows[0].total.toLocaleString()}.`,
    );
  }
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error("[narration:grant] Failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
