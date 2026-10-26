#!/usr/bin/env node
/**
 * Copy the images of everything saved so far into R2 (see
 * docs/ARCHITECTURE.md#image-storage): every article's hero and body images. New saves copy their own; this catches up the rest,
 * while their sources still have them (the Internet Archive is asked when
 * they don't).
 *
 *   pnpm images:backfill            copy what's missing
 *   pnpm images:backfill --dry-run  only count
 *
 * Safe to stop and run again: images already stored are skipped with a HEAD.
 * Loads `.env` / `.env.local` like the migrator; needs DATABASE_URL and the
 * R2_* variables. Prints counts, never any credentials or image URLs.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadDotenv } from "./load-dotenv.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadDotenv(root);

const { articleImageTargets, createImageStore, warmImages } =
  await import("../src/lib/image-store.server.ts");

const dryRun = process.argv.includes("--dry-run");
const PAGE = 100;

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("[images:backfill] DATABASE_URL is required.");
  process.exit(1);
}
const store = createImageStore();
if (!store) {
  console.error(
    "[images:backfill] Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.",
  );
  process.exit(1);
}

const totals = { stored: 0, present: 0, failed: 0 };
const add = (r) => {
  totals.stored += r.stored;
  totals.present += r.present;
  totals.failed += r.failed;
};
const report = (label) =>
  console.log(
    `[images:backfill] ${label}: ${totals.stored} copied, ${totals.present} already stored, ` +
      `${totals.failed} unavailable.`,
  );

/** Copy one batch of targets (a dry run only counts them). */
async function warm(targets) {
  if (dryRun) return { stored: 0, present: 0, failed: 0 };
  return warmImages(store, targets, { limit: targets.length });
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  // Articles, by id so a long run sees each one once.
  let after = "";
  let articles = 0;
  let wanted = 0;
  for (;;) {
    const { rows } = await client.query(
      `select id, content_html, original_html, hero_image from articles
       where id > $1 order by id limit $2`,
      [after, PAGE],
    );
    if (!rows.length) break;
    for (const row of rows) {
      const html = `${row.content_html ?? ""}${row.original_html ?? ""}`;
      const targets = articleImageTargets(html, row.hero_image);
      wanted += targets.length;
      add(await warm(targets));
    }
    articles += rows.length;
    after = rows[rows.length - 1].id;
    report(`${articles} articles (${wanted} images)`);
  }

  report("done");
  if (dryRun) console.log("[images:backfill] Dry run: nothing was fetched or stored.");
} catch (err) {
  console.error("[images:backfill] Failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
