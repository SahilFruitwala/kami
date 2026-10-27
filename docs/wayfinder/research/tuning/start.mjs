// Start a drafted run through the app's startRun and drive it to the end in
// this process (locally there's no run secret, so HTTP hand-offs are refused;
// a stalled run is picked up again here). Logs each change, then a summary.
const ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/, "");
const ORIGIN = "http://localhost:8080";
const { loadDotenv } = await import(`${ROOT}/scripts/load-dotenv.mjs`);
loadDotenv(ROOT);
const [runId] = process.argv.slice(2);
const { getDb } = await import(`${ROOT}/src/lib/db.server.ts`);
const runs = await import(`${ROOT}/src/server/services/research/runs.ts`);
const { validateEditedPlan } = await import(`${ROOT}/src/server/services/research/discover.ts`);
const { getRunById } = await import(`${ROOT}/src/lib/research-runs-db.server.ts`);
const { isStalledRun, isTerminalRun } = await import(`${ROOT}/src/lib/research/run-engine.ts`);

const db = await getDb();
const pool = globalThis.__pgPool__;
const t0 = Date.now();
const secs = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;

let row = await getRunById(db, runId);
if (row.state === "awaiting_plan") {
  const plan = await validateEditedPlan(row, row.plan, row.depth);
  await runs.startRun(row.userId, runId, { plan, depth: row.depth }, ORIGIN);
  console.log(
    `[${secs()}] started: ${plan.filter((q) => q.checked).length} searches, depth ${row.depth}`,
  );
}

let last = "";
for (;;) {
  row = await getRunById(db, runId);
  const { picks: _p, toRead, skippedUrls, ...progress } = row.progress;
  const line = `${row.state} step=${row.step} fc=${row.firecrawlCredits} tok=${row.tokensIn}/${row.tokensOut} ${JSON.stringify({ ...progress, toRead: toRead?.length, skipped: skippedUrls?.length })}`;
  if (line !== last) console.log(`[${secs()}] ${(last = line)}`);
  if (isTerminalRun(row.state)) break;
  if (
    isStalledRun({ state: row.state, leaseUntil: row.leaseUntil?.getTime() ?? null }, Date.now())
  ) {
    await runs.runResearch(runId, ORIGIN, { handOff: async () => {} });
    continue;
  }
  await new Promise((r) => setTimeout(r, 3000));
}

console.log(`\n=== ${row.state}${row.stopReason ? ` (${row.stopReason})` : ""} after ${secs()}`);
if (row.error) console.log("error:", row.error);
console.log(
  `spend: firecrawl ${row.firecrawlCredits}, tokens ${row.tokensIn} in / ${row.tokensOut} out, budget ${row.budgetCredits}, charged ${row.chargedCredits}`,
);
const q = (text, params) => pool.query(text, params).then((r) => r.rows);
console.log("\nsearches:");
for (const s of await q(
  "select query_norm, results from research_queries where run_id = $1 order by created_at",
  [runId],
)) {
  console.log(`  ${String(s.results).padStart(2)}  ${s.query_norm}`);
}
console.log("\npages picked:");
for (const url of row.progress.toRead ?? []) {
  console.log(`  ${row.progress.skippedUrls?.includes(url) ? "SKIP" : "    "} ${url}`);
}
console.log(
  "\nevidence by kind:",
  JSON.stringify(
    await q(
      "select kind, match, count(*)::int n from research_evidence where run_id = $1 group by 1,2 order by 3 desc",
      [runId],
    ),
  ),
);
console.log("\nideas:");
for (const i of await q(
  "select title, summary, status, evidence_count, score from research_ideas where topic_id = $1 order by score_total desc",
  [row.topicId],
)) {
  console.log(
    `  [${i.score?.total}] ${i.title} (${i.evidence_count} quotes) — ${JSON.stringify({ f: i.score?.frequency, s: i.score?.spread, int: i.score?.intensity, pay: i.score?.pays, rec: i.score?.recency, comp: i.score?.competition })}`,
  );
  console.log(`        ${i.summary}`);
}
console.log("\nsample quotes:");
for (const e of await q(
  "select e.kind, e.match, e.quote, s.site from research_evidence e join research_sources s on s.id = e.source_id where e.run_id = $1 order by e.created_at limit 12",
  [runId],
)) {
  console.log(`  ${e.kind}/${e.match} ${e.site}: "${e.quote.slice(0, 160)}"`);
}
await pool.end();
process.exit(0);
