// Recompute every Player's name_key with the current nameKey and merge the
// Players that now share one (per topic): the earliest filled one is kept,
// the others' quote links move to it and they are deleted. No spend.
// Usage: node --experimental-transform-types --import <repo>/tests/support/register.mjs rekey.mjs [--dry]
const ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/, "");
const { loadDotenv } = await import(`${ROOT}/scripts/load-dotenv.mjs`);
loadDotenv(ROOT);
const dry = process.argv.includes("--dry");
const { getDb } = await import(`${ROOT}/src/lib/db.server.ts`);
const { nameKey } = await import(`${ROOT}/src/lib/research/players.ts`);
await getDb();
const pool = globalThis.__pgPool__;
const client = await pool.connect();
try {
  await client.query("begin");
  const { rows } = await client.query(
    "select id, topic_id, name, name_key, filled_at, url, created_at from research_players order by created_at",
  );
  const groups = new Map();
  for (const p of rows) {
    const key = nameKey(p.name) ?? p.name_key;
    const g = `${p.topic_id}:${key}`;
    groups.set(g, [...(groups.get(g) ?? []), { ...p, key }]);
  }
  let merged = 0;
  let rekeyed = 0;
  for (const players of groups.values()) {
    // Keep a filled one with a site if there is one, else the oldest.
    const keep = players.find((p) => p.filled_at && p.url) ?? players[0];
    for (const p of players) {
      if (p === keep) continue;
      console.log(`merge "${p.name}" (${p.name_key}) into "${keep.name}"`);
      await client.query(
        `insert into research_player_evidence (player_id, evidence_id)
         select $1, evidence_id from research_player_evidence where player_id = $2
         on conflict do nothing`,
        [keep.id, p.id],
      );
      await client.query("delete from research_players where id = $1", [p.id]);
      merged++;
    }
    if (keep.name_key !== keep.key) {
      console.log(`rekey "${keep.name}": ${keep.name_key} → ${keep.key}`);
      await client.query("update research_players set name_key = $2 where id = $1", [
        keep.id,
        keep.key,
      ]);
      rekeyed++;
    }
  }
  await client.query(dry ? "rollback" : "commit");
  console.log(`${dry ? "(dry run) " : ""}${merged} merged, ${rekeyed} re-keyed`);
} catch (err) {
  await client.query("rollback");
  throw err;
} finally {
  client.release();
  await pool.end();
}
