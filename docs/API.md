# API reference

REST endpoints served under `/api/*`. Each is a thin wrapper (see `src/routes/api/`) over a service in `src/server/services/`.

## Conventions

- **Auth:** every endpoint except the `/api/hooks/*` webhooks requires a signed-in Clerk session. Webhooks authenticate with a bearer secret (`CRON_SECRET`, `INBOUND_EMAIL_SECRET`; see `.env.example`).
- **Same-site only:** state-changing requests must come from the app's own origin.
- **Bodies:** `application/json`, validated with Zod schemas in `src/lib/api/schemas/`. Other content types get `415`.
- **Verbs:** `GET` reads, `POST` creates/actions, `PATCH` partial update, `PUT` replace, `DELETE` removes.
- **Errors:** JSON `{ "error": "message" }` with a meaningful status (`400`, `401`, `404` for missing-or-not-yours, `409`, `415`, `429`). Successful writes with no payload return `204`.
- **Rate limits:** lookup and extract endpoints are rate limited per user (`429`).
- **Scoping:** all data is scoped to the authenticated user.

Path parameters are written `:name`. For exact request/response shapes read the linked route file and its schema.

## Endpoints

### ai

| Method | Path                                    | Source                                               |
| ------ | --------------------------------------- | ---------------------------------------------------- |
| `POST` | `/api/ai/articles/:id/autotag`          | `src/routes/api/ai/articles/$id/autotag.ts`          |
| `GET`  | `/api/ai/articles/:id/original`         | `src/routes/api/ai/articles/$id/original.ts`         |
| `POST` | `/api/ai/articles/:id/restore-original` | `src/routes/api/ai/articles/$id/restore-original.ts` |
| `GET`  | `/api/ai/articles/:id/summary`          | `src/routes/api/ai/articles/$id/summary.ts`          |
| `POST` | `/api/ai/articles/:id/summary`          | `src/routes/api/ai/articles/$id/summary.ts`          |
| `POST` | `/api/ai/articles/:id/tidy`             | `src/routes/api/ai/articles/$id/tidy.ts`             |
| `POST` | `/api/ai/organize`                      | `src/routes/api/ai/organize.ts`                      |
| `GET`  | `/api/ai/status`                        | `src/routes/api/ai/status.ts`                        |

### allowance

| Method | Path             | Source                              |
| ------ | ---------------- | ----------------------------------- |
| `GET`  | `/api/allowance` | `src/routes/api/allowance/index.ts` |

### articles

| Method | Path                    | Source                               |
| ------ | ----------------------- | ------------------------------------ |
| `POST` | `/api/articles/extract` | `src/routes/api/articles/extract.ts` |
| `POST` | `/api/articles/import`  | `src/routes/api/articles/import.ts`  |
| `POST` | `/api/articles/link`    | `src/routes/api/articles/link.ts`    |

### extracts

| Method   | Path                               | Source                                          |
| -------- | ---------------------------------- | ----------------------------------------------- |
| `PATCH`  | `/api/extracts/:id`                | `src/routes/api/extracts/$id.ts`                |
| `DELETE` | `/api/extracts/:id`                | `src/routes/api/extracts/$id.ts`                |
| `GET`    | `/api/extracts/:id/results`        | `src/routes/api/extracts/$id/results.ts`        |
| `POST`   | `/api/extracts/:id/run`            | `src/routes/api/extracts/$id/run.ts`            |
| `GET`    | `/api/extracts`                    | `src/routes/api/extracts/index.ts`              |
| `POST`   | `/api/extracts`                    | `src/routes/api/extracts/index.ts`              |
| `DELETE` | `/api/extracts/results/:id`        | `src/routes/api/extracts/results/$id.ts`        |
| `POST`   | `/api/extracts/results/:id/accept` | `src/routes/api/extracts/results/$id/accept.ts` |

### feeds

| Method   | Path                             | Source                                        |
| -------- | -------------------------------- | --------------------------------------------- |
| `PATCH`  | `/api/feeds/:id`                 | `src/routes/api/feeds/$id.ts`                 |
| `DELETE` | `/api/feeds/:id`                 | `src/routes/api/feeds/$id.ts`                 |
| `POST`   | `/api/feeds/entries/:id/article` | `src/routes/api/feeds/entries/$id/article.ts` |
| `GET`    | `/api/feeds/entries`             | `src/routes/api/feeds/entries/index.ts`       |
| `POST`   | `/api/feeds/entries/read-all`    | `src/routes/api/feeds/entries/read-all.ts`    |
| `POST`   | `/api/feeds/entries/read`        | `src/routes/api/feeds/entries/read.ts`        |
| `POST`   | `/api/feeds/inbox`               | `src/routes/api/feeds/inbox.ts`               |
| `GET`    | `/api/feeds`                     | `src/routes/api/feeds/index.ts`               |
| `POST`   | `/api/feeds`                     | `src/routes/api/feeds/index.ts`               |
| `GET`    | `/api/feeds/opml`                | `src/routes/api/feeds/opml.ts`                |
| `POST`   | `/api/feeds/opml`                | `src/routes/api/feeds/opml.ts`                |
| `POST`   | `/api/feeds/refresh`             | `src/routes/api/feeds/refresh.ts`             |

### hooks

| Method | Path                       | Source                                  |
| ------ | -------------------------- | --------------------------------------- |
| `GET`  | `/api/hooks/feeds`         | `src/routes/api/hooks/feeds.ts`         |
| `POST` | `/api/hooks/feeds`         | `src/routes/api/hooks/feeds.ts`         |
| `POST` | `/api/hooks/inbound-email` | `src/routes/api/hooks/inbound-email.ts` |

### img

| Method | Path       | Source                  |
| ------ | ---------- | ----------------------- |
| `GET`  | `/api/img` | `src/routes/api/img.ts` |

### journal

| Method | Path                  | Source                             |
| ------ | --------------------- | ---------------------------------- |
| `PUT`  | `/api/journal/:date`  | `src/routes/api/journal/$date.ts`  |
| `POST` | `/api/journal/import` | `src/routes/api/journal/import.ts` |
| `GET`  | `/api/journal`        | `src/routes/api/journal/index.ts`  |

### library

| Method   | Path                       | Source                                    |
| -------- | -------------------------- | ----------------------------------------- |
| `POST`   | `/api/library/bulk`        | `src/routes/api/library/bulk.ts`          |
| `GET`    | `/api/library/export`      | `src/routes/api/library/export.ts`        |
| `PATCH`  | `/api/library/folders/:id` | `src/routes/api/library/folders/$id.ts`   |
| `DELETE` | `/api/library/folders/:id` | `src/routes/api/library/folders/$id.ts`   |
| `POST`   | `/api/library/folders`     | `src/routes/api/library/folders/index.ts` |
| `POST`   | `/api/library/import`      | `src/routes/api/library/import.ts`        |
| `GET`    | `/api/library`             | `src/routes/api/library/index.ts`         |
| `DELETE` | `/api/library`             | `src/routes/api/library/index.ts`         |
| `GET`    | `/api/library/items/:id`   | `src/routes/api/library/items/$id.ts`     |
| `PATCH`  | `/api/library/items/:id`   | `src/routes/api/library/items/$id.ts`     |
| `DELETE` | `/api/library/items/:id`   | `src/routes/api/library/items/$id.ts`     |
| `POST`   | `/api/library/items`       | `src/routes/api/library/items/index.ts`   |
| `POST`   | `/api/library/save`        | `src/routes/api/library/save.ts`          |
| `POST`   | `/api/library/tags`        | `src/routes/api/library/tags.ts`          |

### lookup

| Method | Path                          | Source                                     |
| ------ | ----------------------------- | ------------------------------------------ |
| `GET`  | `/api/lookup/books`           | `src/routes/api/lookup/books.ts`           |
| `GET`  | `/api/lookup/link`            | `src/routes/api/lookup/link.ts`            |
| `GET`  | `/api/lookup/tmdb`            | `src/routes/api/lookup/tmdb.ts`            |
| `GET`  | `/api/lookup/watch-providers` | `src/routes/api/lookup/watch-providers.ts` |

### narrations

Owner-only (404 for anyone else). `POST /api/narrations/run` is internal: it authenticates with the server's run secret, not a session (see ADR 0001).

| Method   | Path                           | Source                                      |
| -------- | ------------------------------ | ------------------------------------------- |
| `GET`    | `/api/narrations/:id`          | `src/routes/api/narrations/$id.ts`          |
| `POST`   | `/api/narrations/:id`          | `src/routes/api/narrations/$id.ts`          |
| `DELETE` | `/api/narrations/:id`          | `src/routes/api/narrations/$id.ts`          |
| `GET`    | `/api/narrations/:id/audio`    | `src/routes/api/narrations/$id/audio.ts`    |
| `PUT`    | `/api/narrations/:id/position` | `src/routes/api/narrations/$id/position.ts` |
| `POST`   | `/api/narrations/run`          | `src/routes/api/narrations/run.ts`          |

### research

Research (`/research`, spec in `docs/wayfinder/research/spec.md`). Every route but `status` answers 404 while Research is off (no `FIRECRAWL_API_KEY` or no AI model). Owner-only: another user's topic, idea or run is a 404. Drafting and starting a run (and pasting a link) count against the `research` rate-limit bucket; runs spend research credits, granted with `pnpm research:grant`. `POST /api/research/runs` drafts Discover (`kind` default), Validate (`kind: "validate", ideaId`) or a question (`kind: "question", question`). `POST /api/research/run` is internal: a run handing itself off to a fresh invocation, authenticated with `RESEARCH_RUN_SECRET`, not a session (see ADR 0001). The `/api/research/debug/*` routes back the operator's debug page and answer 404 unless the caller's email is in `RESEARCH_DEBUG_EMAILS`.

| Method   | Path                                 | Source                                            |
| -------- | ------------------------------------ | ------------------------------------------------- |
| `GET`    | `/api/research/status`               | `src/routes/api/research/status.ts`               |
| `GET`    | `/api/research/credits`              | `src/routes/api/research/credits.ts`              |
| `GET`    | `/api/research/topics`               | `src/routes/api/research/topics/index.ts`         |
| `POST`   | `/api/research/topics`               | `src/routes/api/research/topics/index.ts`         |
| `GET`    | `/api/research/topics/:id`           | `src/routes/api/research/topics/$id.ts`           |
| `PATCH`  | `/api/research/topics/:id`           | `src/routes/api/research/topics/$id.ts`           |
| `DELETE` | `/api/research/topics/:id`           | `src/routes/api/research/topics/$id.ts`           |
| `GET`    | `/api/research/topics/:id/ideas`     | `src/routes/api/research/topics/$id/ideas.ts`     |
| `GET`    | `/api/research/topics/:id/sources`   | `src/routes/api/research/topics/$id/sources.ts`   |
| `GET`    | `/api/research/topics/:id/reports`   | `src/routes/api/research/topics/$id/reports.ts`   |
| `GET`    | `/api/research/topics/:id/players`   | `src/routes/api/research/topics/$id/players.ts`   |
| `POST`   | `/api/research/topics/:id/links`     | `src/routes/api/research/topics/$id/links.ts`     |
| `GET`    | `/api/research/reports/:id`          | `src/routes/api/research/reports/$id.ts`          |
| `GET`    | `/api/research/ideas/:id`            | `src/routes/api/research/ideas/$id.ts`            |
| `PATCH`  | `/api/research/ideas/:id`            | `src/routes/api/research/ideas/$id.ts`            |
| `POST`   | `/api/research/ideas/merge`          | `src/routes/api/research/ideas/merge.ts`          |
| `POST`   | `/api/research/runs`                 | `src/routes/api/research/runs/index.ts`           |
| `GET`    | `/api/research/runs/:id`             | `src/routes/api/research/runs/$id.ts`             |
| `POST`   | `/api/research/runs/:id/start`       | `src/routes/api/research/runs/$id/start.ts`       |
| `POST`   | `/api/research/runs/:id/stop`        | `src/routes/api/research/runs/$id/stop.ts`        |
| `POST`   | `/api/research/run`                  | `src/routes/api/research/run.ts`                  |
| `GET`    | `/api/research/debug`                | `src/routes/api/research/debug/index.ts`          |
| `POST`   | `/api/research/debug/runs`           | `src/routes/api/research/debug/runs/index.ts`     |
| `GET`    | `/api/research/debug/runs/:id`       | `src/routes/api/research/debug/runs/$id.ts`       |
| `POST`   | `/api/research/debug/runs/:id/start` | `src/routes/api/research/debug/runs/$id/start.ts` |
| `POST`   | `/api/research/debug/runs/:id/stop`  | `src/routes/api/research/debug/runs/$id/stop.ts`  |

### shelves

| Method   | Path                                  | Source                                             |
| -------- | ------------------------------------- | -------------------------------------------------- |
| `GET`    | `/api/shelves/:type/:id`              | `src/routes/api/shelves/$type/$id.ts`              |
| `PATCH`  | `/api/shelves/:type/:id`              | `src/routes/api/shelves/$type/$id.ts`              |
| `DELETE` | `/api/shelves/:type/:id`              | `src/routes/api/shelves/$type/$id.ts`              |
| `GET`    | `/api/shelves/:type/duplicates`       | `src/routes/api/shelves/$type/duplicates.ts`       |
| `GET`    | `/api/shelves/:type`                  | `src/routes/api/shelves/$type/index.ts`            |
| `POST`   | `/api/shelves/:type`                  | `src/routes/api/shelves/$type/index.ts`            |
| `POST`   | `/api/shelves/book/:id/page-count`    | `src/routes/api/shelves/book/$id/page-count.ts`    |
| `PUT`    | `/api/shelves/book/:id/progress`      | `src/routes/api/shelves/book/$id/progress.ts`      |
| `POST`   | `/api/shelves/book/import`            | `src/routes/api/shelves/book/import.ts`            |
| `GET`    | `/api/shelves/counts`                 | `src/routes/api/shelves/counts.ts`                 |
| `POST`   | `/api/shelves/tv/:id/episodes/toggle` | `src/routes/api/shelves/tv/$id/episodes/toggle.ts` |
| `GET`    | `/api/shelves/tv/:id/seasons/:season` | `src/routes/api/shelves/tv/$id/seasons/$season.ts` |
| `PUT`    | `/api/shelves/tv/:id/seasons/:season` | `src/routes/api/shelves/tv/$id/seasons/$season.ts` |
| `GET`    | `/api/shelves/tv/:id/seasons`         | `src/routes/api/shelves/tv/$id/seasons/index.ts`   |
| `PUT`    | `/api/shelves/tv/:id/watched`         | `src/routes/api/shelves/tv/$id/watched.ts`         |

### trips

| Method   | Path                                | Source                                           |
| -------- | ----------------------------------- | ------------------------------------------------ |
| `GET`    | `/api/trips/:id`                    | `src/routes/api/trips/$id.ts`                    |
| `PATCH`  | `/api/trips/:id`                    | `src/routes/api/trips/$id.ts`                    |
| `DELETE` | `/api/trips/:id`                    | `src/routes/api/trips/$id.ts`                    |
| `GET`    | `/api/trips/:id/chat`               | `src/routes/api/trips/$id/chat.ts`               |
| `POST`   | `/api/trips/:id/chat`               | `src/routes/api/trips/$id/chat.ts`               |
| `DELETE` | `/api/trips/:id/chat`               | `src/routes/api/trips/$id/chat.ts`               |
| `POST`   | `/api/trips/:id/undo`               | `src/routes/api/trips/$id/undo.ts`               |
| `POST`   | `/api/trips/:id/hotels`             | `src/routes/api/trips/$id/hotels.ts`             |
| `PATCH`  | `/api/trips/:id/hotels/:hotelId`    | `src/routes/api/trips/$id/hotels/$hotelId.ts`    |
| `DELETE` | `/api/trips/:id/hotels/:hotelId`    | `src/routes/api/trips/$id/hotels/$hotelId.ts`    |
| `POST`   | `/api/trips/:id/items`              | `src/routes/api/trips/$id/items.ts`              |
| `PATCH`  | `/api/trips/:id/items/:itemId`      | `src/routes/api/trips/$id/items/$itemId.ts`      |
| `DELETE` | `/api/trips/:id/items/:itemId`      | `src/routes/api/trips/$id/items/$itemId.ts`      |
| `POST`   | `/api/trips/:id/items/:itemId/move` | `src/routes/api/trips/$id/items/$itemId/move.ts` |
| `GET`    | `/api/trips`                        | `src/routes/api/trips/index.ts`                  |
| `POST`   | `/api/trips`                        | `src/routes/api/trips/index.ts`                  |
