import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { Pool, types as pgTypes } from "pg";
import { pendingMigrations } from "../../scripts/migration-plan.mjs";
import * as schema from "./schema";

/** Which database backend is active. */
export type DbSource = "neon" | "pglite";

export type AppDb = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

// An empty/whitespace DATABASE_URL (an easy misconfig in deploy UIs) must mean
// "unset" — otherwise production would silently run on the PGLite fallback.
const rawDatabaseUrl = typeof process !== "undefined" ? process.env.DATABASE_URL : undefined;
const databaseUrl = rawDatabaseUrl && rawDatabaseUrl.trim() ? rawDatabaseUrl : undefined;

/**
 * Active backend: real **Neon** when `DATABASE_URL` is set (deployed / configured
 * sandbox), otherwise a local embedded **PGLite** (Postgres compiled to WASM) so
 * the app has a working database even with nothing configured — the live preview
 * included. Swap in Neon later by just setting `DATABASE_URL`; no code changes.
 */
export const dbSource: DbSource = databaseUrl ? "neon" : "pglite";

/**
 * Init state lives on globalThis as promises: dev HMR creates new instances of
 * this module, and two instances racing module-level state would open a second
 * pool or run two concurrent PGLite migration passes (whose duplicate
 * `_migrations` insert rejects — and would get memoized, poisoning every later
 * `getDb()`). A failed init clears its slot so the next call retries.
 */
const globalRef = globalThis as typeof globalThis & {
  __pgPool__?: Pool;
  __pgliteInstance__?: Promise<PGlite>;
  __pgliteMigrateChain__?: Promise<void>;
  __drizzleDb__?: Promise<AppDb>;
  __authDrizzleDb__?: AppDb;
};

/** Result-type parity for raw driver parsing (pg vs PGLite). */
const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (v: string) => v;

function getPool(): Pool {
  if (!databaseUrl) {
    throw new Error("getPool() requires DATABASE_URL");
  }
  if (!globalRef.__pgPool__) {
    pgTypes.setTypeParser(OID_INT8, Number);
    pgTypes.setTypeParser(OID_DATE, identity);
    pgTypes.setTypeParser(OID_INTERVAL, identity);
    globalRef.__pgPool__ = new Pool({
      connectionString: databaseUrl,
      // Serverless-friendly: cap conns per instance (Neon free tier is
      // small), reap idle ones fast, and fail fast when the DB is
      // unreachable instead of hanging the request.
      max: Number(process.env.DATABASE_POOL_MAX) || 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalRef.__pgPool__;
}

async function initPglite(): Promise<PGlite> {
  globalRef.__pgliteInstance__ ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite({
      parsers: {
        [OID_INT8]: Number,
        [OID_DATE]: identity,
        [OID_INTERVAL]: identity,
      },
    });
    await pg.waitReady;
    await pg.exec(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    return pg;
  })().catch((err) => {
    globalRef.__pgliteInstance__ = undefined;
    throw err;
  });
  return globalRef.__pgliteInstance__;
}

async function migratePglite(pg: PGlite): Promise<void> {
  // Apply migrations/ so preview matches production. SQL is inlined by the
  // bundler via import.meta.glob (no runtime fs). The glob does not descend, so
  // the opt-in auth schema under migrations/auth/ stays out until copied up.
  const migrations = import.meta.glob("/migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const doneRows = await pg.query<{ name: string }>("select name from _migrations");
  const done = doneRows.rows.map((r) => r.name);
  for (const { name, path } of pendingMigrations(Object.keys(migrations), done)) {
    await pg.transaction(async (tx) => {
      await tx.exec(migrations[path]);
      await tx.query("insert into _migrations (name) values ($1)", [name]);
    });
  }
}

async function ensurePgliteMigrated(): Promise<PGlite> {
  const pg = await initPglite();
  const pass = (globalRef.__pgliteMigrateChain__ ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => migratePglite(pg));
  globalRef.__pgliteMigrateChain__ = pass;
  await pass;
  return pg;
}

async function createDb(): Promise<AppDb> {
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/db is server-only — call getDb() from a createServerFn handler " +
        "or a server route loader, never from client code.",
    );
  }
  if (dbSource === "neon") {
    return drizzlePg({ client: getPool(), schema });
  }
  const pg = await ensurePgliteMigrated();
  return drizzlePglite({ client: pg, schema });
}

/**
 * Shared **Drizzle** ORM client. Neon (`node-postgres`) when `DATABASE_URL` is
 * set, otherwise PGLite. Schema: `src/lib/schema.ts`. SQL under `migrations/`
 * is still applied at boot (PGLite) / deploy (`npm run db:migrate`).
 */
export function getDb(): Promise<AppDb> {
  globalRef.__drizzleDb__ ??= createDb().catch((err) => {
    globalRef.__drizzleDb__ = undefined;
    throw err;
  });
  return globalRef.__drizzleDb__;
}

/**
 * The shared PGLite instance (preview only), with `migrations/*.sql` applied.
 */
export async function getPglite(): Promise<PGlite> {
  if (dbSource !== "pglite") {
    throw new Error("getPglite() is only available on the PGLite fallback (no DATABASE_URL)");
  }
  return ensurePgliteMigrated();
}

/**
 * Finish DB bootstrap before the server handles traffic.
 *
 * - **PGLite**: open the in-memory DB and apply `migrations/*.sql`.
 * - **Neon**: no-op (pool is created lazily on first query).
 */
export function ensureDbReady(): Promise<void> {
  if (dbSource !== "pglite") return Promise.resolve();
  return getDb().then(() => undefined);
}

/**
 * @deprecated Prefer `getDb()`. Kept briefly for any leftover callers.
 */
export function getAuthDb(): AppDb {
  if (typeof window !== "undefined") {
    throw new Error("getAuthDb() is server-only");
  }
  if (globalRef.__authDrizzleDb__) return globalRef.__authDrizzleDb__;

  if (dbSource === "neon") {
    globalRef.__authDrizzleDb__ = drizzlePg({ client: getPool(), schema });
    return globalRef.__authDrizzleDb__;
  }

  void ensureDbReady();
  let client: PGlite | null = null;
  const ready = ensurePgliteMigrated().then((pg) => {
    client = pg;
    return pg;
  });
  const lazy = {
    query: async (...args: Parameters<PGlite["query"]>) => {
      const pg = client ?? (await ready);
      return pg.query(...args);
    },
    exec: async (...args: Parameters<PGlite["exec"]>) => {
      const pg = client ?? (await ready);
      return pg.exec(...args);
    },
  };
  globalRef.__authDrizzleDb__ = drizzlePglite({
    client: lazy as unknown as PGlite,
    schema,
  });
  return globalRef.__authDrizzleDb__;
}

// Server-only eager start: kick PGLite bootstrap as soon as this module loads in
// Node. Client bundles never hit this path (`getDb` throws in the browser).
const globalBoot = globalThis as typeof globalThis & {
  __pgBootstrapPromise__?: Promise<void>;
};
if (typeof window === "undefined" && dbSource === "pglite") {
  globalBoot.__pgBootstrapPromise__ ??= ensureDbReady().catch((err) => {
    globalBoot.__pgBootstrapPromise__ = undefined;
    console.error("[db] PGLite bootstrap failed:", err);
    throw err;
  });
}
