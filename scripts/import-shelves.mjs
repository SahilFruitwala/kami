#!/usr/bin/env node
// @ts-check
/**
 * Import shelf data (TV / Movies / Books / Wishlist / Places / Restaurants)
 * from the SQLite shelf app into this app's Postgres.
 *
 * Usage:
 *   SQLITE_PATH=/path/to/shelf.db DATABASE_URL=... node scripts/import-shelves.mjs
 *   node scripts/import-shelves.mjs --sqlite /path/to/shelf.db --limit 50 --dry-run
 *
 * Source: SQLite file with drizzle `sqlite-core` tables:
 *   user, user_feature_flags, lists, list_members, restaurants, movies,
 *   tv_shows, books, places, wishlist_items, genres, movie_genres,
 *   tv_show_genres, book_genres, activity, item_reactions, watched_episodes
 *
 * Target: Postgres tables from migrations/0003_shelves.sql (same names).
 * - unixepoch seconds -> timestamptz
 * - 0/1 integers -> booleans
 * - extra_metadata TEXT JSON -> jsonb
 * - Upserts by PK so re-runs are safe; FK order is respected.
 *
 * Requires: Node 22+ (node:sqlite) and `pg` (already a dependency).
 */
import { existsSync } from "node:fs";
import pg from "pg";
import { loadDotenv } from "./load-dotenv.mjs";

const root = new URL("..", import.meta.url).pathname;
loadDotenv(root);

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "1";
}

const sqlitePath = flag("--sqlite") ?? process.env.SQLITE_PATH ?? "";
const dryRun = args.includes("--dry-run");
const limit = Number(flag("--limit") ?? "0") || 0;
const only = (flag("--only") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && !dryRun) {
  console.error("[import-shelves] DATABASE_URL is required (or use --dry-run).");
  process.exit(1);
}
if (!sqlitePath || !existsSync(sqlitePath)) {
  console.error(`[import-shelves] SQLite file not found: ${sqlitePath || "(empty)"}`);
  console.error("  Pass --sqlite /path/to/shelf.db or set SQLITE_PATH.");
  process.exit(1);
}

// Tables in FK-safe order. `user` first — target "user" uses camelCase
// createdAt/updatedAt plus the new deleted_at/purge_after; source uses
// unixepoch ints, so map explicitly.
const ORDER = [
  "user",
  "user_feature_flags",
  "lists",
  "list_members",
  "genres",
  "restaurants",
  "movies",
  "tv_shows",
  "books",
  "places",
  "wishlist_items",
  "movie_genres",
  "tv_show_genres",
  "book_genres",
  "activity",
  "item_reactions",
  "watched_episodes",
  "rate_limits",
];

const toDate = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return new Date(v * 1000);
  return new Date(v);
};
const toBool = (v) => (v == null ? null : Boolean(v));
const toJson = (v) => {
  if (v == null) return {};
  if (typeof v === "object") return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return {};
  }
};
// Source user.created_at/updated_at/deleted_at/purge_after are unixepoch ints.
function mapRow(table, row) {
  const r = { ...row };
  for (const k of [
    "created_at",
    "updated_at",
    "saved_at",
    "completed_at",
    "deleted_at",
    "purge_after",
    "watched_at",
  ]) {
    if (k in r) r[k] = toDate(r[k]);
  }
  // createdAt/updatedAt camelCase never appear in the sqlite source, but the
  // pg "user" table needs them — derive from snake or now.
  if (table === "user") {
    r.createdAt = toDate(row.created_at) ?? new Date();
    r.updatedAt = toDate(row.updated_at) ?? new Date();
    delete r.created_at;
    delete r.updated_at;
    r.emailVerified = toBool(row.email_verified ?? row.emailVerified ?? false);
    delete r.email_verified;
  }
  if (table === "user_feature_flags") {
    r.sharing = toBool(row.sharing ?? false);
  }
  for (const t of ["restaurants", "movies", "tv_shows", "books", "places", "wishlist_items"]) {
    if (table === t && "extra_metadata" in r) r.extra_metadata = toJson(r.extra_metadata);
  }
  if (table === "lists" && "is_default" in r) r.is_default = toBool(r.is_default);
  return r;
}

async function main() {
  const { DatabaseSync } = await import("node:sqlite");
  const src = new DatabaseSync(sqlitePath, { readOnly: true });

  const tables = ORDER.filter((t) => !only.length || only.includes(t));
  /** @type {Record<string, any[]>} */
  const batch = {};
  for (const t of tables) {
    try {
      const q = limit ? `SELECT * FROM "${t}" LIMIT ${limit}` : `SELECT * FROM "${t}"`;
      const rows = src.prepare(q).all();
      batch[t] = rows.map((row) => mapRow(t, row));
      console.log(`[import-shelves] read ${t}: ${rows.length} row(s)`);
    } catch (err) {
      console.log(`[import-shelves] skip ${t}: ${err?.message}`);
      batch[t] = [];
    }
  }
  src.close();

  if (dryRun) {
    console.log("[import-shelves] dry-run — no writes.");
    for (const [t, rows] of Object.entries(batch)) {
      if (rows[0]) console.log(`  ${t} sample:`, JSON.stringify(rows[0]).slice(0, 300));
    }
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    // Same human, different Clerk instance: the target DB already has this
    // user under another id (matched by email). Remap every user reference
    // to the existing row instead of inserting a duplicate email.
    /** @type {Record<string, string>} */
    const userRemap = {};
    if ((batch.user ?? []).length) {
      const kept = [];
      for (const u of batch.user) {
        const found = await client.query('SELECT id FROM "user" WHERE email = $1 LIMIT 1', [
          u.email,
        ]);
        if (found.rows[0] && found.rows[0].id !== u.id) {
          userRemap[u.id] = found.rows[0].id;
          console.log(`[import-shelves] remap user ${u.id} -> ${found.rows[0].id} (${u.email})`);
        } else {
          kept.push(u);
        }
      }
      batch.user = kept;
    }
    if (Object.keys(userRemap).length) {
      for (const [t, rows] of Object.entries(batch)) {
        for (const row of rows) {
          for (const c of ["user_id", "owner_id", "added_by"]) {
            if (typeof row[c] === "string" && userRemap[row[c]]) row[c] = userRemap[row[c]];
          }
          // rate_limits keys embed the subject (`search:<userId>`).
          if (t === "rate_limits" && typeof row.key === "string") {
            for (const [from, to] of Object.entries(userRemap)) {
              row.key = row.key.split(from).join(to);
            }
          }
        }
      }
    }
    for (const t of tables) {
      const rows = batch[t];
      if (!rows.length) continue;
      const cols = Object.keys(rows[0]);
      const colList = cols.map((c) => `"${c}"`).join(", ");
      let n = 0;
      for (const row of rows) {
        const vals = cols.map((c) => {
          const v = row[c];
          return typeof v === "object" && v !== null && !(v instanceof Date)
            ? JSON.stringify(v)
            : v;
        });
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        // Upsert by PK where we know it; join tables use full-row conflict guard.
        const conflict =
          t === "movie_genres"
            ? `("movie_id","genre_id")`
            : t === "tv_show_genres"
              ? `("tv_show_id","genre_id")`
              : t === "book_genres"
                ? `("book_id","genre_id")`
                : t === "item_reactions"
                  ? `("item_id","user_id")`
                  : t === "watched_episodes"
                    ? `("item_id","season","number")`
                    : t === "rate_limits"
                      ? `("key")`
                      : `("id")`;
        const updates = cols
          .filter((c) => c !== "id" && c !== "key")
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(", ");
        await client.query(
          `INSERT INTO "${t}" (${colList}) VALUES (${placeholders}) ON CONFLICT ${conflict} DO UPDATE SET ${updates || '"id" = EXCLUDED."id"'}`,
          vals,
        );
        n += 1;
      }
      console.log(`[import-shelves] upserted ${t}: ${n}`);
    }
    console.log("[import-shelves] done.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[import-shelves] failed:", err?.message || err);
  process.exit(1);
});
