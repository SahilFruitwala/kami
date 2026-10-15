import "@tanstack/react-start/server-only";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, types as pgTypes } from "pg";
import * as schema from "./schema";

export type AppDb = NodePgDatabase<typeof schema>;

// DATABASE_URL is required — there is no embedded fallback. An empty or
// whitespace-only value is treated as unset so deploy-UI misconfigs fail
// loudly instead of connecting somewhere surprising.
const rawDatabaseUrl = typeof process !== "undefined" ? process.env.DATABASE_URL : undefined;
const databaseUrl = rawDatabaseUrl && rawDatabaseUrl.trim() ? rawDatabaseUrl : undefined;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required (Postgres/Neon). Set it in .env / the deploy environment.",
  );
}

/**
 * Init state lives on globalThis as a promise: dev HMR creates new instances
 * of this module, and two instances racing module-level state would open a
 * second pool. A failed init clears its slot so the next call retries.
 */
const globalRef = globalThis as typeof globalThis & {
  __pgPool__?: Pool;
  __drizzleDb__?: Promise<AppDb>;
};

/** Keep raw driver parsing stable for bigint/date/interval columns. */
const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (v: string) => v;

function getPool(): Pool {
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

async function createDb(): Promise<AppDb> {
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/db is server-only — call getDb() from a server service (src/server/services) " +
        "or a server route handler, never from client code.",
    );
  }
  return drizzlePg({ client: getPool(), schema });
}

/**
 * Shared **Drizzle** ORM client over Postgres (`node-postgres`).
 * Schema: `src/lib/schema.ts`. Migrations: `migrations/*.sql` applied via
 * `npm run db:migrate` (deploy) or `pnpm db:migrate` (local Docker).
 */
export function getDb(): Promise<AppDb> {
  globalRef.__drizzleDb__ ??= createDb().catch((err) => {
    globalRef.__drizzleDb__ = undefined;
    throw err;
  });
  return globalRef.__drizzleDb__;
}
