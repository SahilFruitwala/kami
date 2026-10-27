// Draft a Discover plan as the debug operator, through the app's own draftRun.
// Usage: node --experimental-transform-types --import <repo>/tests/support/register.mjs draft.mjs "<seed>" quick
const ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/, "");
const { loadDotenv } = await import(`${ROOT}/scripts/load-dotenv.mjs`);
loadDotenv(ROOT);
const [seed, depth = "quick", topicId, stopRunId] = process.argv.slice(2);
const { getDb } = await import(`${ROOT}/src/lib/db.server.ts`);
const runs = await import(`${ROOT}/src/server/services/research/runs.ts`);
const { discoverDrafter } = await import(`${ROOT}/src/server/services/research/discover.ts`);
const { researchCreditBalance } = await import(`${ROOT}/src/lib/research-credits-db.server.ts`);

const email = (process.env.RESEARCH_DEBUG_EMAILS ?? "").split(",")[0].trim();
const db = await getDb();
const found = await globalThis.__pgPool__.query(
  'select id from "user" where lower(email) = lower($1) and deleted_at is null',
  [email],
);
const userId = found.rows[0]?.id;
if (!userId) throw new Error("No account for the first RESEARCH_DEBUG_EMAILS entry.");
console.log("balance before:", await researchCreditBalance(db, userId));

if (stopRunId) {
  const stopped = await runs.requestStop(userId, stopRunId, "http://localhost:8080");
  console.log(`stopped old draft ${stopRunId}: ${stopped.state}`);
}
const { run, topic } = await runs.draftRun(
  userId,
  { kind: "discover", depth, input: { seed }, topicId: topicId || undefined },
  discoverDrafter(),
);
console.log(
  JSON.stringify(
    {
      runId: run.id,
      topicId: topic.id,
      state: run.state,
      tokensIn: run.tokensIn,
      tokensOut: run.tokensOut,
    },
    null,
    1,
  ),
);
for (const q of run.plan) {
  console.log(
    `${q.checked ? "[x]" : "[ ]"} ${q.id.padEnd(4)} ${q.intent.padEnd(12)} ${(q.site ?? "web").padEnd(24)} ${q.query}${q.repeat ? "  (repeat)" : ""}`,
  );
}
await globalThis.__pgPool__?.end();
