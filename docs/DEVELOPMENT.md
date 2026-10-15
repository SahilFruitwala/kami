# Development

Local setup, environment variables, and day-to-day commands.

## Prerequisites

- **Node.js 22+** (ESM project, `"type": "module"`)
- **pnpm** recommended (`pnpm-lock.yaml` is committed); npm works
- **Docker** for local Postgres (required — `DATABASE_URL` must be set)
- **Clerk** account for auth (required)

---

## First-time setup

```bash
git clone https://github.com/SahilFruitwala/simple-pocket.git
cd simple-pocket
cp .env.example .env
```

Edit `.env`:

1. Set Clerk keys from [dashboard.clerk.com](https://dashboard.clerk.com/).
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

### Database

`DATABASE_URL` is required. Local dev uses Docker Postgres; there is no
embedded fallback.

---

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Prod: yes | Postgres connection string (required) |
| `VITE_AUTH_ENABLED` | no | `"false"` disables Clerk (fail-closed — every request is rejected) |
| `VITE_CLERK_PUBLISHABLE_KEY` | when auth on | Clerk publishable key |
| `CLERK_SECRET_KEY` | when auth on | Clerk secret (server only) |
| `TMDB_API_TOKEN` | for movie/TV search | TMDB Bearer token; without it search returns empty |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_URL` | optional | Redis REST URL for read-through cache |
| `UPSTASH_REDIS_REST_TOKEN` / `UPSTASH_TOKEN` | optional | Redis REST token |
| `DATABASE_POOL_MAX` | optional | pg pool size per instance (default `5`) |
| `VITE_PUBLIC_HOSTNAME` | optional | Public host for OG / share cards |
| `CRON_SECRET` | optional | Bearer secret for the (unscheduled) feed sweep hook `/api/hooks/feeds` ([Feeds](./ARCHITECTURE.md#feeds--newsletters)) |
| `INBOUND_EMAIL_DOMAIN` / `INBOUND_EMAIL_SECRET` | optional | Private newsletter addresses + inbound-email webhook secret ([Feeds](./ARCHITECTURE.md#feeds--newsletters)) |
| `GOOGLE_GENERATIVE_AI_API_KEY` / `OPENROUTER_API_KEY` | for AI features | Model provider keys; at least one enables the library AI features ([AI features](./ARCHITECTURE.md#ai-features)) |
| `AI_MODELS` | no | Model chain as `provider:model`, comma-separated, tried in order; default `google:gemini-3.8-flash,openrouter:anthropic/claude-haiku-5.5` |
| `FIRECRAWL_API_KEY` | for `/extracts` | Firecrawl API key; without it extracts can be saved but not run ([Extracts](./ARCHITECTURE.md#extracts-firecrawl)) |

Env loading: `scripts/with-app-env.mjs` and `scripts/load-dotenv.mjs` load `.env` then `.env.local` before Vite/build/migrate. Never commit `.env`.

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Dev server on **0.0.0.0:8080** (`strictPort`) |
| `pnpm build` | Vite production build + migrate (skipped on Vercel Preview builds unless `MIGRATE_ON_BUILD=1`) |
| `pnpm preview` | Preview build (port **8081**) |
| `pnpm db:up` / `db:down` / `db:logs` | Docker Compose Postgres lifecycle |
| `pnpm db:migrate` | Apply pending `migrations/*.sql` |
| `pnpm typecheck` | TypeScript check |
| `pnpm test` | `node --test` on `tests/**/*.test.mjs` (`tests/support/register.mjs` resolves `@/` imports, so server modules are testable) |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |

---

## Project layout (cheat sheet)

```
src/
  routes/          # File routes → routeTree.gen.ts
    api/           # REST endpoints (/api/*) — thin wrappers over services
  server/          # Server-only
    http.ts        # apiHandler: auth, same-site, rate limit, Zod, errors
    services/      # Business logic + DB access, one module per domain
  components/      # UI (library/, reader/, ui/, kami.tsx, …)
  hooks/           # Capture, shelf queries, filters
  lib/
    api/           # Typed fetch client + shared request/response types
    *-remote.ts    # Client sync
    *.server.ts    # Server-only (do not import from client)
    auth/          # Clerk provider, gates, server session checks
    schema.ts      # Drizzle tables
    db.server.ts   # getDb() — Postgres via pg pool (server-only)
    library-item.ts # Library domain types, LIBRARY_LIMITS, clamp (isomorphic)
    id.ts          # uid()
    store.ts       # Zustand library (client only)
    journal.ts     # Zustand journal
  styles.css       # Tailwind + Kami design tokens
migrations/        # Ordered SQL
scripts/           # migrate, env, import-shelves
```

---

## Debugging tips

| Symptom | Check |
|---------|--------|
| Auth loops / 401 on `/api/*` | Clerk keys, clock skew, `VITE_AUTH_ENABLED` |
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
- Type safety: `pnpm typecheck` before pushing schema/API changes.

---

## Deployment notes

- Target: **Vercel** via Nitro `vercel` preset (see `vite.config.ts`).
- Build runs migrations on Production (and non-Vercel) builds; Vercel Preview builds skip them unless `MIGRATE_ON_BUILD=1` — keep SQL forward-compatible.
- Production expects Neon (or similar) + Clerk; Upstash recommended.
- CSP: `src/lib/csp.ts` (sent per HTML response with a fresh script nonce by `src/start.ts`; no `'unsafe-inline'` for scripts) — update when adding new third-party script/connect origins. Other security headers live in `vercel.json`. Production Clerk JS is served from `https://clerk.kami.sahilfruitwala.com` (custom Frontend API), which `https://*.clerk.com` does not cover.

See also [Architecture](./ARCHITECTURE.md) and [Contributing](./CONTRIBUTING.md).
