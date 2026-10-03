// @ts-check
/**
 * Migration bookkeeping shared by the deploy applier — `scripts/migrate.mjs`
 * (`readdir`).
 *
 * Applied files are keyed by BASENAME, so the same file applies once no matter
 * which directory it is globbed from. That is what makes the auth schema safe to
 * copy from `migrations/auth/` into `migrations/` when an app turns sign-in on:
 * a database that already has `0001_auth.sql` will not re-run it.
 *
 * Neither applier descends into subdirectories, so `migrations/auth/*.sql` is
 * out of scope for both until it is copied up.
 */

/**
 * The `_migrations` key for a migration path (or bare filename).
 * @param {string} path
 * @returns {string}
 */
export function migrationName(path) {
  return path.split("/").pop() ?? path;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationFile(path) {
  return path.endsWith(".sql");
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingMigrations(paths, applied) {
  const done = new Set(applied);
  return [...paths]
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ name }) => !done.has(name));
}

/**
 * Whether `pnpm build` should apply migrations. Vercel builds Preview
 * deployments (every pushed branch) with the same command as Production; if
 * they share a DATABASE_URL, an unmerged branch's migration would hit the
 * production database. So build-time migration runs only for Production
 * Vercel builds and non-Vercel builds. `MIGRATE_ON_BUILD=1` forces it (e.g.
 * previews with their own Neon branch); `MIGRATE_ON_BUILD=0` disables it.
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function shouldMigrateOnBuild(env) {
  const flag = env.MIGRATE_ON_BUILD?.trim();
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production";
  return true;
}
