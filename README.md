# KAMI (Quarto)

Personal read-later library, shelves, and highlight vault — packaged as **KAMI** in the UI, **`quarto`** in code and Docker.

Save articles and X posts into a calm reader, organize with tags and folders, track movies/TV/books on shelves, and collect every highlight in one vault.

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

| Script                                            | What it does                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm dev`                                        | Vite + TanStack Start on port **8080**                                        |
| `pnpm build`                                      | Production build → Vercel Nitro output + migrate                              |
| `pnpm typecheck`                                  | `tsc --noEmit`                                                                |
| `pnpm test`                                       | Node tests under `tests/**/*.test.mjs`                                        |
| `pnpm lint` / `pnpm format` / `pnpm format:check` | ESLint / Prettier (CI runs typecheck, lint, format:check, test)               |
| `pnpm ai:grant <email> on` / `off`                | Turn library AI, the trip agent, and Research on or off (everyone starts off) |
| `pnpm research:grant <email> <credits>`           | Grant research credits to a user (Research is metered; everyone starts at 0)  |

---

## What lives where

| Path                                 | Role                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| [`src/routes/`](src/routes/)         | File-based pages (`/`, `/library`, `/trips`, `/research`, `/read`, `/shelves`, `/vault`, `/settings`, `/login`) |
| [`src/components/`](src/components/) | UI — library, reader, shelves widgets, Kami brand primitives, shadcn `ui/`                                      |
| [`src/routes/api/`](src/routes/api/) | REST endpoints (`/api/*`) — thin HTTP wrappers over services. See [API reference](docs/API.md)                  |
| [`src/server/`](src/server/)         | Server-only: `http.ts` (auth, validation, errors) + `services/` (business logic, DB)                            |
| [`src/lib/`](src/lib/)               | API client (`api/`), client sync (`*-remote.ts`), schema, auth, extract, cache                                  |
| [`src/hooks/`](src/hooks/)           | React hooks (capture, shelf queries, filters)                                                                   |
| [`migrations/`](migrations/)         | Hand-written SQL applied via `pnpm db:migrate`                                                                  |
| [`scripts/`](scripts/)               | Env loader, migrator, shelf import                                                                              |
| [`docs/`](docs/)                     | Architecture, API, data model, development, contributing                                                        |
| [`extension/`](extension/)           | "Save to KAMI" browser extension (Chrome / Edge / Firefox, MV3)                                                 |

---

## Product map

| Route       | Feature                                                                         |
| ----------- | ------------------------------------------------------------------------------- |
| `/`         | Landing (signed out) or desk home with URL capture (signed in)                  |
| `/library`  | Inbox / archive, folders, tags, search                                          |
| `/read?id=` | Distraction-free reader — highlights, fonts, paper tone                         |
| `/shelves`  | Movies, TV, books, wishlist (TMDB / Open Library lookups)                       |
| `/trips`    | Trip planner — details, a hotel shortlist, and a day-by-day itinerary           |
| `/vault`    | All highlights in one place; edit or delete notes and highlights; export        |
| `/settings` | Account, appearance, bookmarklet, import/export, wipe                           |
| `/capture`  | Receives pages from the bookmarklet / browser extension (`postMessage` handoff) |
| `/share`    | Web Share Target — Android share sheet → save URL                               |
| `/login`    | Clerk sign-in / sign-up                                                         |
| `/api/img`  | Authenticated image proxy for remote covers                                     |

---

## Stack (short)

- **React 19** + **TanStack Start / Router / Query** + **Vite 8**
- **Clerk** auth · **Drizzle** + **Postgres** · optional **Upstash Redis**
- **Tailwind 4** + shadcn-style UI · **Zustand** for library · **Zod** validators
- Deploy target: **Vercel** (Nitro `vercel` preset)

---

## Docs

| Doc                                  | Read when you need to…                                     |
| ------------------------------------ | ---------------------------------------------------------- |
| [Architecture](docs/ARCHITECTURE.md) | Understand request flow, auth isolation, caching, diagrams |
| [Data model](docs/DATA-MODEL.md)     | Tables, relationships, migration rules                     |
| [Development](docs/DEVELOPMENT.md)   | Env vars, local DB, scripts, debugging                     |
| [API](docs/API.md)                   | REST endpoint reference                                    |
| [Contributing](docs/CONTRIBUTING.md) | Add a route, API endpoint, schema change, shelf type, UI   |

---

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately per [SECURITY.md](SECURITY.md).

---

## License

[MIT](LICENSE) © Sahil Fruitwala
