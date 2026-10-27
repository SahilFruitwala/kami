// Create a new Discover run in the same topic with an earlier run's plan,
// through the app's draftRun but without a model call (the plan is given).
// Usage: rerun.mjs <earlier run id>
const ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/, "");
const { loadDotenv } = await import(`${ROOT}/scripts/load-dotenv.mjs`);
loadDotenv(ROOT);
const [fromRunId] = process.argv.slice(2);
const { getDb } = await import(`${ROOT}/src/lib/db.server.ts`);
const runs = await import(`${ROOT}/src/server/services/research/runs.ts`);
const { getRunById } = await import(`${ROOT}/src/lib/research-runs-db.server.ts`);
const { researchCreditBalance } = await import(`${ROOT}/src/lib/research-credits-db.server.ts`);

const db = await getDb();
const from = await getRunById(db, fromRunId);
const plan = from.plan.map((q) => ({ ...q, checked: true }));
const { run } = await runs.draftRun(
  from.userId,
  { topicId: from.topicId, kind: "discover", depth: from.depth, input: from.input },
  async () => ({ plan, tokensIn: 0, tokensOut: 0 }),
);
console.log(
  JSON.stringify({
    runId: run.id,
    topicId: run.topicId,
    state: run.state,
    queries: run.plan.length,
    balance: await researchCreditBalance(db, from.userId),
  }),
);
await globalThis.__pgPool__.end();
