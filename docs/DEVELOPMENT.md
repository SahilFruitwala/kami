# Development

Local setup, environment variables, and day-to-day commands.

## Prerequisites

- **Node.js 22+** (ESM project, `"type": "module"`)
- **pnpm** recommended (`pnpm-lock.yaml` is committed); npm works
- **Docker** for local Postgres (optional — PGLite works without it)
- **Clerk** account for auth (or disable auth for throwaway local work)

---

## First-time setup

```bash
git clone https://github.com/SahilFruitwala/simple-pocket.git
cd simple-pocket
cp .env.example .env
```

Edit `.env`:

1. Set Clerk keys from [dashboard.clerk.com](https://dashboard.clerk.com/) **or** set `VITE_AUTH_ENABLED=false`.
2. Prefer Docker DB:

```bash
pnpm install
pnpm db:up        # docker compose up -d  → postgres:16 on :5432
pnpm db:migrate
pnpm dev          # http://0.0.0.0:8080
```

Default Docker URL (already in `.env.example`):

```
DATABASE_URL=postgresql://quarto:quarto@127.0.0.1:5432/quarto
```

### Zero-config mode

Omit `DATABASE_URL` entirely. The app boots **PGLite**, applies the same SQL migrations in-process, and stores data in memory for that process. Useful for UI spikes; data does not survive restarts the way Docker Postgres does.

---

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Prod: yes | Postgres connection string. Empty/whitespace = PGLite |
| `VITE_AUTH_ENABLED` | no | `"false"` disables Clerk (local only; fail-closed with real DB) |
| `VITE_CLERK_PUBLISHABLE_KEY` | when auth on | Clerk publishable key |
| `CLERK_SECRET_KEY` | when auth on | Clerk secret (server only) |
| `TMDB_API_TOKEN` | for movie/TV search | TMDB Bearer token; without it search returns empty |
| `UPSTASH_REDIS_REST_URL` | optional | Redis REST URL for read-through cache |
| `UPSTASH_REDIS_REST_TOKEN` | optional | Redis REST token |
| `DATABASE_POOL_MAX` | optional | pg pool size per instance (default `5`) |
| `VITE_PUBLIC_HOSTNAME` | optional | Public host for OG / share cards |

Env loading: `scripts/with-app-env.mjs` and `scripts/load-dotenv.mjs` load `.env` then `.env.local` before Vite/build/migrate. Never commit `.env`.

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Dev server on **0.0.0.0:8080** (`strictPort`) |
| `pnpm build` | Vite production build + copy PGLite assets + migrate |
| `pnpm preview` | Preview build (port **8081**) |
| `pnpm db:up` / `db:down` / `db:logs` | Docker Compose Postgres lifecycle |
| `pnpm db:migrate` | Apply pending `migrations/*.sql` |
| `pnpm typecheck` | TypeScript check |
| `pnpm test` | `node --test` on `scripts/**/*.test.mjs` |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |

---

## Project layout (cheat sheet)

```
src/
  routes/          # File routes → routeTree.gen.ts
  components/      # UI (library/, reader/, ui/, kami.tsx, …)
  hooks/           # Capture, TTS, shelf queries, filters
  lib/
    *-fns.ts       # Server API
    *-remote.ts    # Client sync
    *.server.ts    # Server-only (do not import from client)
    auth/          # Clerk provider, gates, middleware
    schema.ts      # Drizzle tables
    db.ts          # getDb() — Neon/pg or PGLite
    store.ts       # Zustand library
    journal.ts     # Zustand journal
  styles.css       # Tailwind + Kami design tokens
migrations/        # Ordered SQL
scripts/           # migrate, env, pglite copy, import-shelves
```

---

## Debugging tips

| Symptom | Check |
|---------|--------|
| Auth loops / 401 on ServerFns | Clerk keys, clock skew, `VITE_AUTH_ENABLED` |
| Empty movie/TV search | `TMDB_API_TOKEN` |
| Stale shelf data with Redis | Mutation path must call `invalidateUserCache` |
| Migration “already applied” locally | Inspect `_migrations` or reset Docker volume (`db:down` + remove volume) |
| `getDb` / ALS errors in browser | You imported a `*.server.ts` or `db.ts` into client code |
| Port in use | Dev insists on **8080**; stop the other process |

Useful Docker reset:

```bash
pnpm db:down
docker volume rm workspace_quarto_pg_data 2>/dev/null || docker volume ls | grep quarto
pnpm db:up && pnpm db:migrate
```

(Volume name depends on compose project directory — check `docker volume ls`.)

---

## Testing

- Script unit tests: `pnpm test` (dotenv, migration plan, with-app-env).
- Manual: run `pnpm dev`, sign in, exercise capture → reader → vault → shelves → journal.
- Type safety: `pnpm typecheck` before pushing schema/ServerFn changes.

---

## Deployment notes

- Target: **Vercel** via Nitro `vercel` preset (see `vite.config.ts`).
- Build runs migrations when `DATABASE_URL` is set — keep SQL forward-compatible.
- Production expects Neon (or similar) + Clerk; Upstash recommended.
- CSP / headers: `vercel.json` — update when adding new third-party script/connect origins. Production Clerk JS is served from `https://clerk.kami.sahilfruitwala.com` (custom Frontend API), which `https://*.clerk.com` does not cover.

See also [Architecture](./ARCHITECTURE.md) and [Contributing](./CONTRIBUTING.md).
