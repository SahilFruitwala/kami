# KAMI (Quarto)

Personal read-later library, shelves, journal, and highlight vault — packaged as **KAMI** in the UI, **`quarto`** in code and Docker.

Save articles and X posts into a calm reader, organize with tags and folders, track movies/TV/books on shelves, jot a daily journal, and collect every highlight in one vault.

---

## Quick start

```bash
# Prerequisites: Node 22+, pnpm (or npm), Docker (required for local Postgres), Clerk keys
cp .env.example .env
# Fill in Clerk keys

pnpm install          # or: npm install
pnpm db:up            # starts Postgres 16 via docker compose
pnpm db:migrate       # applies migrations/*.sql
pnpm dev              # http://0.0.0.0:8080
```

`DATABASE_URL` is required (local Docker Postgres or hosted Postgres/Neon).

| Script | What it does |
|--------|----------------|
| `pnpm dev` | Vite + TanStack Start on port **8080** |
| `pnpm build` | Production build → Vercel Nitro output + migrate |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Node tests under `scripts/**/*.test.mjs` |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |

---

## What lives where

| Path | Role |
|------|------|
| [`src/routes/`](src/routes/) | File-based pages (`/`, `/library`, `/read`, `/shelves`, `/journal`, `/vault`, `/settings`, `/login`) |
| [`src/components/`](src/components/) | UI — library, reader, shelves widgets, Kami brand primitives, shadcn `ui/` |
| [`src/lib/`](src/lib/) | ServerFns (`*-fns.ts`), client sync (`*-remote.ts`), schema, auth, extract, cache |
| [`src/hooks/`](src/hooks/) | React hooks (capture, TTS, shelf queries, filters) |
| [`migrations/`](migrations/) | Hand-written SQL applied via `pnpm db:migrate` |
| [`scripts/`](scripts/) | Env loader, migrator, shelf import |
| [`docs/`](docs/) | Architecture, data model, development, contributing |

---

## Product map

| Route | Feature |
|-------|---------|
| `/` | Landing (signed out) or desk home with URL capture (signed in) |
| `/library` | Inbox / archive, folders, tags, search |
| `/read?id=` | Distraction-free reader — highlights, fonts, paper tone, TTS |
| `/shelves` | Movies, TV, books, wishlist (TMDB / Open Library lookups) |
| `/journal` | Daily entries with highlight “slips” |
| `/vault` | All highlights in one place; export |
| `/settings` | Account, appearance, bookmarklet, import/export, wipe |
| `/login` | Clerk sign-in / sign-up |
| `/api/img` | Authenticated image proxy for remote covers |

---

## Stack (short)

- **React 19** + **TanStack Start / Router / Query** + **Vite 8**
- **Clerk** auth · **Drizzle** + **Postgres** · optional **Upstash Redis**
- **Tailwind 4** + shadcn-style UI · **Zustand** for library/journal · **Zod** validators
- Deploy target: **Vercel** (Nitro `vercel` preset)

---

## Docs

| Doc | Read when you need to… |
|-----|-------------------------|
| [Architecture](docs/ARCHITECTURE.md) | Understand request flow, auth isolation, caching, diagrams |
| [Data model](docs/DATA-MODEL.md) | Tables, relationships, migration rules |
| [Development](docs/DEVELOPMENT.md) | Env vars, local DB, scripts, debugging |
| [Contributing](docs/CONTRIBUTING.md) | Add a route, ServerFn, schema change, shelf type, UI |

---

## License

Private repository. All rights reserved unless otherwise noted.
