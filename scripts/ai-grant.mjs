#!/usr/bin/env node
/**
 * Turn library AI (and the trip agent / Research) on or off for one user.
 * Everyone starts off; this is the operator's only way to flip the flag.
 *
 *   pnpm ai:grant <email> on
 *   pnpm ai:grant <email> off
 *
 * Loads `.env` / `.env.local` like the migrator; needs DATABASE_URL.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadDotenv } from "./load-dotenv.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadDotenv(root);

const [email, rawOn] = process.argv.slice(2);
const on = rawOn === "on" ? true : rawOn === "off" ? false : null;

if (!email || on === null) {
  console.error("Usage: pnpm ai:grant <email> on|off");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("[ai:grant] DATABASE_URL is required.");
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
    console.error(`[ai:grant] No user with email ${email}.`);
    process.exitCode = 1;
  } else {
    const userId = found.rows[0].id;
    await client.query(
      `insert into user_feature_flags (user_id, sharing, ai, updated_at)
       values ($1, false, $2, now())
       on conflict (user_id) do update set ai = excluded.ai, updated_at = now()`,
      [userId, on],
    );
    console.log(`[ai:grant] AI ${on ? "on" : "off"} for ${email}.`);
  }
} catch (err) {
  console.error("[ai:grant] Failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
