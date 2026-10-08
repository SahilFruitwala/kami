# KAMI Mobile — Specification

> Audience: Claude Code (and humans) implementing the KAMI mobile app.
> Companion: [`DESIGN.md`](./DESIGN.md) — visual language, IA, wireframes, component inventory, reader architecture.
> Normative words: **MUST**, **SHOULD**, **MAY** are used in the RFC 2119 sense.
> Facts about the existing backend were verified against the repo at the time of writing (file paths given). Anything marked **VERIFY** is an assumption you must confirm by reading code or testing before relying on it.

---

## 0. How to use this document (instructions for Claude Code)

1. Read `DESIGN.md` and this file fully. Then read `docs/ARCHITECTURE.md`, `docs/DATA-MODEL.md`, `src/lib/api/*.ts`, `src/server/http.ts`, `src/lib/auth/*.ts`.
2. Work **milestone by milestone** (§12). Each milestone ends with its acceptance criteria passing and `pnpm typecheck && pnpm lint && pnpm test` green in both the web package and `mobile/`.
3. **Milestone 0 touches the web backend** and must be its own PR. Do not start mobile screens that need the API until M0 is merged or at least working locally.
4. Commit in small, reviewable steps. Don't refactor unrelated web code. Don't edit applied migrations.
5. When this spec is silent or wrong, prefer the behaviour of the web app, state the assumption in the PR description, and continue; ask the owner only for the items in §15.
6. Never commit secrets. The web `.env` holds Clerk/DB keys; the mobile app only ever uses `EXPO_PUBLIC_*` values.

---

## 1. Goals and scope

### 1.1 Goal
Ship an iOS + Android app that lets a signed-in KAMI user **save, read, highlight and organise articles (online and offline)**, **triage feeds**, and **manage shelves**, backed by the existing KAMI API and account.

### 1.2 In scope (v1)

| Area | v1 scope |
|---|---|
| Auth | Sign in/up/out with the existing Clerk instance |
| Capture | Paste URL; OS share sheet (iOS Share Extension / Android intent); link-only fallback offline |
| Library | List, search, filter (inbox/archive/favorites, folder, tag), archive, favourite, delete, tag, move to folder, note, bulk actions |
| Reader | Offline reading, typography prefs, paper tones, highlights with colours and notes, progress, TTS, open original |
| Feeds | Subscriptions, entries (unread/all/saved), mark read, save to library, refresh, add feed, newsletter address |
| Shelves | Movies, Series, Books, Wishlist: list, add via lookup, status, detail, episode tracking, book progress |
| Vault | All highlights, edit note/delete, export |
| Trips | List, board (details/hotels/itinerary), agent chat |
| Extracts | Sources, run, accept/discard |
| Settings | Theme, reader defaults, export, clear cache, sign out, sync issues |
| Offline | Offline reading + queued writes (outbox) |

### 1.3 Out of scope (v1)
- Journal (paused on web: local-only store, no server sync — `src/lib/journal.ts`; `journal_entries` table is unused). **Do not build.**
- Push notifications, widgets, watch apps, tablet-specific layouts.
- OPML import/export UI, Goodreads/StoryGraph import, JSON library import (web-only for v1).
- Account deletion flow (link out to web; see DESIGN §11 for App Store caveat).
- Any server rewrite. Backend changes are limited to §4.

### 1.4 Platforms
iOS 16+ and Android 8.0+ (API 26+). Phones primary. Portrait primary; reader MAY rotate.

---

## 2. Users and key journeys

Single persona: **an existing or new KAMI user** who reads on their phone.

| # | Journey | Success criterion |
|---|---|---|
| J1 | Save from Safari/Chrome/X via share sheet | Article appears in Library within 5 s of sharing (online) or on next connectivity (offline); user never leaves the source app |
| J2 | Read a saved article on a flight | Opens with no network; highlights and font prefs work; progress restored |
| J3 | Highlight a passage with a note | Highlight persists across app restarts and appears on web after sync |
| J4 | Triage feeds | Refresh, scan, save 3 entries to the library in under a minute |
| J5 | Check off an episode | Toggling a watched episode takes one tap and survives offline |
| J6 | Ask the trip agent to plan a day | Streaming reply visible, board updates after tool calls |

---

## 3. System context

```
 Mobile app (Expo/RN)                      Existing KAMI backend (Vercel)
 ───────────────────                       ───────────────────────────────
 Clerk Expo SDK ── session JWT ──►  Authorization: Bearer … ──► clerkMiddleware()
 apiClient  ── JSON /api/* ───────►  apiHandler → services → Postgres/Redis
 Share ext ──► outbox ────────────►  POST /api/articles/extract + /api/library/items
```

- The mobile app is a **client only**. There is no new service or database.
- All business logic stays in `src/server/services/*`. Mobile calls the same endpoints as the web.
- User isolation is enforced server-side by Clerk `userId` (`requireUserId`). Mobile MUST NOT send a user id.

---

## 4. Backend changes required (Milestone 0 — separate PR)

The API was built for a same-origin browser with cookie sessions. Native clients differ. Each item below has a **VERIFY** step: confirm the current behaviour first, then change only what's needed.

### 4.1 Bearer-token auth
- Current: `src/start.ts` registers `clerkMiddleware()`; `requireUserId()` in `src/lib/auth/verify.server.ts` calls Clerk `auth()`.
- Needed: requests carrying `Authorization: Bearer <Clerk session JWT>` MUST authenticate as that user.
- **VERIFY:** Clerk's `authenticateRequest` natively accepts a Bearer session token for non-browser clients, so `clerkMiddleware()` + `auth()` may already work unchanged. Prove it with an integration check: obtain a token from a dev Clerk instance (`getToken()` in Expo, or a Clerk testing token) and `curl -H "Authorization: Bearer …" http://localhost:8080/api/library`. If it returns 401, fix by configuring `clerkMiddleware({ authorizedParties: [...] })` / `acceptsToken` per the installed `@clerk/tanstack-react-start` version's docs. Document the result in `docs/mobile/NOTES.md`.
- Tokens are short-lived (~60 s); the mobile client MUST call `getToken()` per request (Clerk caches/refreshes).

### 4.2 CSRF / same-site checks for non-browser clients
- `src/lib/auth/isolation.server.ts`: `assertSameSiteRequest()` allows requests with **no `Sec-Fetch-Site` header** (non-browser). React Native `fetch` does not send it → passes. **No change expected.**
- `src/start.ts` uses TanStack Start `createCsrfMiddleware` for `/api/*` (excluding `/api/hooks/*`). **VERIFY** that it accepts requests with no `Origin` and no `Sec-Fetch-*` headers (as RN sends). If it rejects them, extend the `filter` to skip requests that carry a valid `Authorization: Bearer` header (browser JS cannot attach that cross-site without a CORS preflight, so this does not weaken CSRF protection for cookie sessions).
- The JSON `Content-Type` requirement in `apiHandler` stays; mobile sets it on every request that has a body (including empty-body POSTs that declare a body schema — send `{}`).

### 4.3 Authenticated image proxy
- `GET /api/img?url=…` requires Clerk auth (`src/routes/api/img.ts`) and is rate-limited (`image`: 600/min).
- RN `<Image>` cannot add per-request auth headers reliably. Options (pick the first that works, **VERIFY**):
  1. `expo-image` with `source={{ uri, headers: { Authorization } }}` (supported) — preferred; token must be fresh, so fetch via a helper that calls `getToken()`.
  2. Prefetch images through `apiClient` into the file cache (`expo-file-system`) when an article is cached for offline, then render `file://` URIs. **Required anyway for offline reading** (§8).
- No backend change unless both fail; in that case add an opt-in signed-URL variant (separate decision; ask owner).

### 4.4 API documentation
- `README.md`/`ARCHITECTURE.md` link to `docs/API.md` which **does not exist**. Create `docs/API.md` generated from route files and `src/lib/api/*` (endpoint table in §5 of this spec is a starting point). Keep it factual.

### 4.5 Optional, recommended (can slip to v1.1)
- **Delta sync** for the library: `GET /api/library?updatedSince=<ms>` returning changed rows and a `deletedIds` list (needs `updated_at` + tombstones; the `articles` table may lack both — check `src/lib/schema.ts`). Without it, mobile refetches pages and merges by id (acceptable for v1).
- Mobile-friendly `GET /api/library/items/:id` is already present; ensure it returns `contentHtml` (it does for web).

### 4.6 Acceptance criteria for M0
- [ ] Bearer-authenticated `GET /api/library`, `POST /api/articles/extract`, `PATCH /api/library/items/:id` succeed from `curl` and from a minimal Expo test screen.
- [ ] Requests without a token still return `401 {"error":"Unauthorized"}`.
- [ ] Cookie-session web flows unchanged (run web app, sign in, library loads).
- [ ] No weakening of SSRF/CSRF protections; tests added where behaviour changed (`scripts/**/*.test.mjs` pattern).
- [ ] `docs/mobile/NOTES.md` records VERIFY outcomes.

---

## 5. API contract used by mobile

Base URL from `EXPO_PUBLIC_API_URL`. All routes under `/api`. JSON in/out, `Content-Type: application/json` on bodies. Errors: `{ "error": string }` with status 400/401/403/404/409/415/429/500; `429` includes `Retry-After` seconds. `204` = no content. Responses are `Cache-Control: private, no-store`.

> Source of truth for shapes: `src/lib/api/*.ts` (client) and `src/server/services/*.ts` (Zod schemas). Mobile types MUST mirror them; when copying, add a `// mirrors src/lib/api/<file>` comment.

### 5.1 Core types (mirror from web)

```ts
// src/lib/store.ts
type Highlight = { id: string; text: string; note: string; createdAt: number; color: "vermilion"|"bamboo"|"sumi" };
type Folder = { id: string; name: string };
type LibraryItem = {
  id: string; url: string; canonicalUrl: string; title: string; author: string; siteName: string;
  source: "blog" | "x"; wordCount: number; readingMinutes: number; excerpt: string;
  contentHtml: string; heroImage: string | null; published: string | null;
  savedAt: number;            // epoch ms
  archived: boolean; tags: string[]; folderId: string | null;
  highlights: Highlight[]; favorited: boolean; note: string;
};
// src/lib/article-types.ts
type Article = { url; canonicalUrl; title; author; siteName; published: string|null; excerpt; contentHtml;
                 wordCount; readingMinutes; source; heroImage: string|null };
type ExtractResult = { ok: true; article: Article } | { ok: false; error: string };
```

Limits (from `src/lib/item-ops.ts`): max **12 tags**/article (tag ≤ 28 chars), max **80 highlights**/article, highlight note ≤ **1000** chars.

### 5.2 Endpoints

| Domain | Method & path | Purpose / notes |
|---|---|---|
| **Library** | `GET /api/library?limit&cursorSavedAt&cursorId` | Keyset page (`saved_at DESC, id DESC`). First page also returns `folders` and `total`. Response `LibraryPage { library, folders, nextCursor, total }`. Default boot page 100. |
| | `GET /api/library/items/:id` | One item incl. `contentHtml`. 404 if missing. |
| | `POST /api/library/items` | Upsert full `LibraryItem` (matched by id / canonicalUrl / url). **Returned id may differ** — adopt it. |
| | `PATCH /api/library/items/:id` | Partial: `archived, favorited, note, folderId, tags, highlights, tagOps, highlightOps`. **Prefer `tagOps`/`highlightOps`** (merge-safe, row-locked) over replacing arrays. |
| | `DELETE /api/library/items/:id` | |
| | `POST /api/library/bulk` | `{ urls: string[] }` (≤ 50) extract + save → `{ saved, skipped, errors }` |
| | `POST /api/library/folders` · `PATCH/DELETE /api/library/folders/:id` | Folder CRUD (`{id?, name}`) |
| | `GET /api/library/export` | Full snapshot (settings → export) |
| | `DELETE /api/library` | Wipe (web-only UI; do not expose on mobile) |
| **Capture** | `POST /api/articles/extract` `{ url }` | → `ExtractResult`; **does not save**. Rate bucket `extract` (120/10 min). |
| | `POST /api/articles/link` `{ url, title? }` | Link-only stub, no fetch; reader extracts on open. Use as offline/failed-extract fallback. |
| | `POST /api/articles/import` | HTML/text paste or browser capture; **not needed on mobile v1.** |
| **Feeds** | `GET /api/feeds` | `{ feeds: FeedSummary[], inbox: NewsletterInbox }` |
| | `POST /api/feeds` `{ url }` | Subscribe (discovery) → `{ feed, added }` |
| | `PATCH/DELETE /api/feeds/:id` | rename (`{title|null}`) / unfollow |
| | `POST /api/feeds/refresh` `{ force?, feedId? }` | One bounded batch → `{ polled, newEntries, failed, remaining }`; **repeat while `remaining > 0`, max 8 batches** |
| | `GET /api/feeds/entries?view=unread|all|saved&feedId&cursorAt&cursorId&limit` | → `{ entries, nextCursor }` |
| | `POST /api/feeds/entries/read` `{ ids }` · `POST /api/feeds/entries/read-all` `{ feedId? }` | |
| | `POST /api/feeds/entries/:id/article` | → `{ok,article}` or `{ok,existingId}` or `{ok:false,error}`; then upsert via library |
| | `POST /api/feeds/inbox` `{ rotate? }` | Create/rotate private newsletter address |
| **Shelves** | `GET /api/shelves/counts` | `{movie,tv,book,wishlist}` counts |
| | `GET /api/shelves/:type?status&q&limit&offset` | `ShelfCard[]`; `type` ∈ movie, tv, book, wishlist |
| | `POST /api/shelves/:type` | Add `{title, notes?, link?, imageUrl?, metadata?, status?}` |
| | `GET /api/shelves/:type/duplicates?title&tmdbId` | Pre-add duplicate check |
| | `GET/PATCH/DELETE /api/shelves/:type/:id` | detail / `{status}` / delete |
| | `PUT /api/shelves/book/:id/progress` | `{mode:"pages",currentPage,pageCount}` or `{mode:"percent",percent}` |
| | `POST /api/shelves/book/:id/page-count` | Fill page count from Open Library |
| | `GET /api/shelves/tv/:id/seasons` · `…/seasons/:season` | Seasons / episodes |
| | `POST /api/shelves/tv/:id/episodes/toggle` `{season,number}` | → `{watched}` |
| | `PUT /api/shelves/tv/:id/seasons/:season` `{numbers,watched}` · `PUT …/watched` `{watched}` | Bulk tick |
| **Lookup** | `GET /api/lookup/tmdb`, `/books`, `/watch-providers`, `/link` | Search/metadata. Bucket `lookup` 240/min. See `src/lib/api/lookup.ts` for params. |
| **Trips** | `GET/POST /api/trips` · `GET/PATCH/DELETE /api/trips/:id` | Whole trip returned on every write |
| | `POST /api/trips/:id/hotels` · `PATCH/DELETE …/hotels/:hotelId` | Shortlist/choose |
| | `POST /api/trips/:id/items` · `PATCH/DELETE …/items/:itemId` | Itinerary (`dayIndex`, `slot`) |
| | `GET/POST/DELETE /api/trips/:id/chat` | History / **streaming** agent turn / clear. See §9.6. |
| **Extracts** | `GET/POST /api/extracts` · `PATCH/DELETE /api/extracts/:id` | Sources (≤ 50) |
| | `POST /api/extracts/:id/run` · `GET /api/extracts/:id/results` | Run (bucket `firecrawl` 30/h) / history |
| | `POST /api/extracts/results/:id/accept` · `DELETE /api/extracts/results/:id` | Accept / discard |
| **Media** | `GET /api/img?url=` | Authenticated image proxy (see §4.3) |
| **Not for mobile** | `/api/hooks/*`, `/api/journal/*`, `/api/library/import`, `/api/feeds/opml` | server hooks / paused / v1.1 |

Rate-limit buckets (`src/lib/rate-limit.server.ts`): `extract` 120/10 min, `lookup` 240/min, `image` 600/min, `feeds` 60/10 min, `firecrawl` 30/h, `agent` 40/h, `inbound` 300/day. The client MUST honour `429 + Retry-After` (pause that bucket, show a non-blocking toast; never hot-loop).

### 5.3 Client rules
- One `apiClient` module; no raw `fetch` in screens/hooks.
- Typed errors: `ApiError { status, message }`. `401` → try one token refresh and retry once; if still 401 → sign out and route to auth. Match `message === "Unauthorized"`.
- Timeouts: 15 s default, 60 s for extract/refresh/run, none for streaming (cancellable).
- Idempotent GETs retry up to 2× with 300 ms/900 ms backoff on network error or 5xx. Mutations are **not** auto-retried by the client; the outbox owns retry.
- Use `encodeURIComponent` on every path segment (web `seg()` helper).

---

## 6. Functional requirements by feature

Each requirement has an ID. Acceptance criteria (AC) are testable statements.

### 6.1 Authentication (AUTH)
- **AUTH-1** App MUST show an auth stack when signed out and the tab app when signed in; deep links to protected screens redirect to sign-in, then return.
- **AUTH-2** Sign-in methods: email+password and/or email code, Google; Apple Sign-In on iOS if any social provider is enabled (App Store guideline 4.8). Must match what the Clerk instance has enabled (**VERIFY** in Clerk dashboard; ask owner).
- **AUTH-3** Session token stored via `expo-secure-store` (Clerk `tokenCache`).
- **AUTH-4** Sign out clears: secure token, query cache, SQLite article store, outbox (after warning if outbox non-empty), image cache.
- **AC:** Cold start while signed in shows Home without flashing the auth screen. Sign-out then sign-in as a different user shows none of the previous user's data.

### 6.2 Capture (CAP)
- **CAP-1** Home capture field accepts a URL (trims, adds `https://` if missing scheme, rejects non-http(s)).
- **CAP-2** Save flow: `POST /api/articles/extract` → on `ok`, build a `LibraryItem` (new `uuid` id, `savedAt = Date.now()`, `archived:false`, `tags:[]`, `folderId:null`, `highlights:[]`, `favorited:false`, `note:""`) → optimistic insert → `POST /api/library/items` → adopt returned id.
- **CAP-3** If extraction returns `{ok:false}` show the server's error with actions **Save as link** (`POST /api/articles/link`, stub reads on open) and **Dismiss**.
- **CAP-4** Offline: enqueue `{type:"capture", url}` in the outbox; show a placeholder row "Saving… (offline)"; process when online.
- **CAP-5** Duplicate URL: server upserts by canonical URL; UI shows the existing item and a toast "Already in your library".
- **CAP-6** Share extension/intent (DESIGN §5.11) uses the same pipeline; MUST work when the main app isn't running (iOS: extension needs the token → share the Clerk session via **Keychain access group**; Android: handled in-app via intent. **VERIFY** feasibility with `expo-share-intent`; if the iOS extension cannot read the token, fall back to "extension writes URL to shared App Group storage, app ingests on next foreground" and tell the user "Saved — will finish when you open KAMI").
- **AC:** Sharing a Substack post from Safari results in a readable library item with title, author, reading time and images. Sharing an X post yields `source:"x"`. Sharing twice doesn't duplicate.

### 6.3 Library (LIB)
- **LIB-1** Views: Inbox (`archived=false`), Archive (`archived=true`), Favorites (`favorited=true`). Sort: newest (default), oldest, shortest reading time.
- **LIB-2** Filters: folder (single), tags (multi, AND), text search over title/site/author/tags/excerpt (client-side on cached rows, debounced 150 ms).
- **LIB-3** Pagination: load first 100 via cursor; infinite scroll for the rest; background-sync all pages to SQLite when on Wi-Fi/any network (setting: "Download everything for offline" default ON for metadata, bodies fetched lazily/on open + prefetch of the newest N=50 inbox items).
- **LIB-4** Row actions (swipe/long-press): archive/unarchive, favourite, delete (undo 5 s), add tag, move to folder, copy link, open original.
- **LIB-5** Bulk (long-press multi-select): archive, delete, tag, move. Implemented as individual `PATCH`es via the outbox (the bulk endpoint is for saving links only).
- **LIB-6** Folders: list/create/rename/delete (deleting a folder sets articles' `folderId` to null — server `ON DELETE SET NULL`).
- **LIB-7** Tags: free text, normalised with `normalizeTag` (trim, collapse whitespace, ≤ 28 chars), max 12 per article, case-insensitive uniqueness. Use `tagOps`.
- **LIB-8** Article details sheet: tags, folder, note (autosave debounced 600 ms), word count, saved date, original URL.
- **AC:** 2,000-item library scrolls at 60 fps; applying a filter updates in < 100 ms; archive in airplane mode reflects immediately and syncs after reconnect, visible on web.

### 6.4 Reader (RDR)
- **RDR-1** Opens from Library, Home, Vault (with `highlightId`), Feeds (after save), deep link `kami://read/<id>`.
- **RDR-2** Body source: SQLite cache → else `GET /api/library/items/:id` → cache. Link-only stubs (empty `contentHtml`) trigger extraction on open via `POST /api/articles/extract` then `PATCH`/upsert to store the body.
- **RDR-3** Rendering per DESIGN §8.
- **RDR-4** Preferences (persisted locally; optional sync later): font family (serif/sans/mono), size 14–26, line height 1.4–2.0, margins (narrow/normal/wide), paper tone (`pale|aged|sumi`), justify on/off. Live preview.
- **RDR-5** Highlights: select text → toolbar with 3 ink colours, Note, Copy. Creating one sends `highlightOps:[{op:"add", highlight}]` with client-generated id (`uuid`), `createdAt=Date.now()`. Update colour/note → `{op:"update", id, color?, note?}`. Delete → `{op:"remove", id}`. Enforce 80/article and note ≤ 1000 with inline messages.
- **RDR-6** Highlight anchoring is by text match (no offsets are stored). When the highlight text appears multiple times, wrap the **first not-yet-wrapped** occurrence in document order; document this limitation in code comments.
- **RDR-7** Progress: store scroll fraction per article id **locally** (SQLite/MMKV). Not synced in v1 (no server field). Restore on open. Mark "read" visuals at ≥ 95%.
- **RDR-8** TTS via `expo-speech`: paragraph queue, play/pause, speed 0.75/1/1.25/1.5/2, voice picker (system voices), auto-scroll to current paragraph, stops on leaving reader, handles audio interruptions. Background audio MAY be deferred.
- **RDR-9** Actions: favourite, archive, tags/folder, note, share (system sheet with original URL), copy link, open original in `expo-web-browser`, delete.
- **RDR-10** Links inside articles open in the in-app browser; images tap-to-zoom (v1.1 acceptable to skip).
- **AC:** Create highlight on a paragraph spanning `<em>` boundaries → persists, reappears after killing the app, shows on web `/read` and `/vault`. Offline reading of a cached article works with images. Changing paper tone doesn't reload scroll position. A 20k-word article opens in < 1 s on a mid-range device.

### 6.5 Feeds (FEED)
- **FEED-1** Overview from `GET /api/feeds`; unread counts per feed; failing feeds show `lastError`.
- **FEED-2** Entries paged by cursor (`limit` 30). Views: unread/all/saved.
- **FEED-3** Opening an entry marks it read (optimistic, batched `POST /read` with debounce 1 s / on background).
- **FEED-4** Save to library: `POST /api/feeds/entries/:id/article` → `{ok,article}` ⇒ upsert as in CAP-2; `{existingId}` ⇒ navigate to it.
- **FEED-5** Refresh: pull-to-refresh calls `refresh({})` repeatedly while `remaining>0` (max 8), shows progress; the per-feed "Retry" calls `refresh({feedId, force:true})`. Surface 429.
- **FEED-6** Add feed: URL → `POST /api/feeds`; show "Added" or "Already following".
- **FEED-7** Newsletter: show address if `inbox.enabled`; Create (`rotate:false`) / New address (`rotate:true`, confirmation).
- **FEED-8** Unfollow (confirm).
- **AC:** Nothing polls in the background (server design: on-demand only). Mark-all-read clears badges immediately and persists.

### 6.6 Shelves (SHELF)
- **SHELF-1** Tabs movie/tv/book/wishlist with counts from `/shelves/counts`; list via `GET /shelves/:type` (`limit/offset` paged, `status` filter, `q` search).
- **SHELF-2** Add flow: query `/lookup/tmdb` (movie/tv) or `/lookup/books` (**VERIFY param names in `src/lib/api/lookup.ts`**), pick result → check `/duplicates` → `POST /shelves/:type` with `title, imageUrl, link, metadata, status`. Wishlist uses manual title + link + notes (or link preview via `/lookup/link`).
- **SHELF-3** Status values: `to_try | done | abandoned`. Changing status uses `PATCH`.
- **SHELF-4** TV detail: seasons list with watched counts, episode list per season, toggle one (`episodes/toggle`), mark season (`PUT seasons/:season`), mark all (`PUT watched`). Handle `hasTmdb=false` ("episodes unavailable, track manually" — show only status).
- **SHELF-5** Books: progress by pages or percent; "Fill page count" action.
- **SHELF-6** "Where to watch" via `/lookup/watch-providers` with country picker defaulting to device region.
- **SHELF-7** Cover images through `/api/img` (cached on disk via `expo-image` cache policy `disk`).
- **AC:** Adding the same TMDB title twice is prevented with a clear message. Episode toggles work offline and sync in order.

### 6.7 Vault (VAULT)
- Aggregate highlights **client-side from the cached library** (there is no vault endpoint). Group by article; newest highlight first; filter by colour; search text/notes.
- Edit note / delete → same `highlightOps`. Tap → Reader scrolled to that highlight.
- Export: Markdown (`# Title` / `> highlight` / note) via system share sheet.
- **AC:** Highlight made on web appears after pull-to-refresh; deleting in Vault removes it in Reader.

### 6.8 Trips (TRIP)
- **TRIP-1** List (`GET /trips`), create (`destination` required; optional title/startDate/dayCount 1–30), delete (confirm).
- **TRIP-2** Board: details edit (title, destination, start date, day count, travellers, budget, preferences), hotels (add, shortlist/choose — only one `chosen`, update, remove), itinerary by day/slot (add, edit, move, delete). Every write returns the full trip → replace cache entry.
- **TRIP-3** Limits shown in UI: 50 trips, 30 hotels/trip, 300 items/trip; cannot shorten past a day that still has plans (surface server error).
- **TRIP-4** Chat (see §9.6). Quick prompts: "Plan day 1", "Suggest 3 hotels", "What am I missing?".
- **AC:** Chat reply streams; after a write tool call the board reflects changes without manual refresh.

### 6.9 Extracts (EXT)
- Source CRUD (name?, url, question); **Run** and **Run live** (`live` semantics — **VERIFY** body flag in `src/routes/api/extracts/$id/run.ts`); show pending Markdown result (render with a Markdown component, links open in-app browser); Accept/Discard; history list.
- Disable Run with explanatory text when the server reports Firecrawl isn't configured (**VERIFY** error shape).
- **AC:** Rate-limit 429 shows "Try again in N min".

### 6.10 Settings (SET)
- Theme (system/light/dark), reader defaults, offline storage (usage, cap, clear), sync issues list, export library (`GET /api/library/export` → write file → share sheet), account info (from Clerk), sign out, app version/build, links (privacy, terms — **ask owner for URLs**).

---

## 7. Data and storage

### 7.1 Local database (expo-sqlite)
Minimum tables (all keyed by `user_id` so sign-out/in is safe):

| Table | Columns (summary) |
|---|---|
| `articles` | `id PK, user_id, url, canonical_url, title, author, site_name, source, word_count, reading_minutes, excerpt, hero_image, published, saved_at, archived, favorited, note, folder_id, tags_json, highlights_json, content_html NULL, content_cached_at NULL, dirty INT` |
| `folders` | `id PK, user_id, name` |
| `reading_progress` | `article_id PK, fraction REAL, updated_at` |
| `outbox` | `seq INTEGER PK AUTOINCREMENT, user_id, kind, entity_id, payload_json, attempts, next_attempt_at, last_error, created_at` |
| `meta` | `key PK, value` (sync cursors, last full sync, schema version) |

Migrations: versioned in `mobile/src/db/migrations/`; never edit a shipped migration.
Other server data (feeds, shelves, trips, extracts) lives only in the TanStack Query persisted cache (MMKV/AsyncStorage persister, 24 h `gcTime`, `maxAge` 7 d), not SQLite.

### 7.2 Outbox semantics
- FIFO per entity; **coalesce** consecutive PATCHes to the same article (merge ops arrays; last-write-wins for scalars).
- Kinds: `capture`, `article.patch`, `article.delete`, `folder.create|rename|delete`, `feed.markRead`, `feed.markAllRead`, `shelf.status`, `shelf.episodeToggle`, `shelf.bookProgress`, `shelf.add`, `shelf.delete`.
- Flush triggers: app foreground, connectivity regained (`@react-native-community/netinfo`), after each enqueue, every 60 s while foregrounded.
- Retry: backoff 2 s → 5 min cap; permanent failure (4xx except 401/408/429) → mark failed, surface in Settings → Sync issues. 401 pauses the queue until re-auth.
- Capture items hold the raw URL; extraction happens at flush time.
- Local IDs: client-generated UUID v4. For `capture`, after upsert adopt the **returned** id and rewrite dependent outbox rows.
- Before a refetch overwrites a row, skip rows with `dirty=1` or pending outbox entries.

### 7.3 Offline reading cache
- On save and on open, store `content_html` and prefetch images referenced by it to `FileSystem.cacheDirectory/kami/<userId>/<articleId>/` (rewrite `src` to local `file://` at render time, keep original in DB).
- Eviction: when over the cap (default 500 MB), delete bodies/images of oldest archived items first, then oldest read inbox items; never evict items with `dirty` or pending outbox rows.

---

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Budgets in DESIGN §10 |
| Reliability | No data loss on crash/kill: outbox + `dirty` flags persisted before any network call |
| Security | HTTPS only; tokens in SecureStore; WebView hardened (DESIGN §8); no logging of tokens/article content; Android `allowBackup=false` for the auth store; certificate pinning NOT required |
| Privacy | No analytics SDKs v1; Sentry optional with scrubbing, opt-in |
| Accessibility | DESIGN §9, WCAG AA |
| i18n | English only v1, but all strings through a `t()` wrapper (`i18n-js` or `expo-localization` + simple map) |
| Observability | Dev-only logger; a hidden "Diagnostics" screen (Settings → About, tap version 7×) showing API base URL, user id, outbox size, last sync |
| Compatibility | Works against the deployed backend without server changes beyond M0 |
| Time | Server timestamps are epoch ms numbers in article/feed APIs; trip `startDate` is `YYYY-MM-DD` (UTC math — reuse logic from `src/lib/trip-days.ts`) |

---

## 9. Technical specifications

### 9.1 Repository layout

```
mobile/
  app/                       # Expo Router
    (auth)/sign-in.tsx, sign-up.tsx
    (tabs)/index.tsx (Home), library.tsx, feeds.tsx, shelves.tsx, more.tsx
    read/[id].tsx
    feeds/entry/[id].tsx
    shelves/[type]/[id].tsx
    trips/index.tsx, trips/[id].tsx
    extracts/index.tsx, extracts/[id].tsx
    vault.tsx, settings.tsx
    _layout.tsx
  src/
    api/                     # client.ts, library.ts, feeds.ts, shelves.ts, trips.ts, extracts.ts, lookup.ts, types.ts
    db/                      # sqlite open, migrations, repositories
    sync/                    # outbox.ts, library-sync.ts, network.ts
    reader/                  # ReaderWebView, template.ts, inject.js (highlight engine), prefs.ts
    components/              # per DESIGN §6
    theme/                   # tokens.ts, paperTones.ts
    hooks/ stores/ lib/
  assets/
  app.config.ts  eas.json  package.json  tsconfig.json  .env.example
```
Add `mobile` to `pnpm-workspace.yaml`. Provide scripts: `pnpm --filter mobile start|ios|android|lint|typecheck|test`.

### 9.2 Reusing web code
`src/lib/api/*.ts` is nearly portable (plain `fetch` + types), but it imports type-only symbols from `@/lib/store` (Zustand module), `@/lib/schema` (Drizzle) and `@/lib/shelves`. Choose, in order of preference:
1. **Copy & adapt** the API modules into `mobile/src/api/` (replace `credentials:"same-origin"` + relative URLs with base URL + bearer header), with `// mirrors` comments. Simple; drift risk managed by §9.7.
2. Extract `packages/api-types` (pure types + Zod) consumed by both. Cleaner but touches web build; only do it if the owner approves.
Never import anything from `src/server/**` or `*.server.ts`.

### 9.3 API client sketch

```ts
export async function request<T>(method: string, path: string, opts: {query?: Query; body?: unknown; signal?: AbortSignal; timeoutMs?: number} = {}): Promise<T> {
  const token = await getToken();                       // Clerk
  const res = await fetch(buildUrl(BASE + path, opts.query), {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  if (res.status === 204) return undefined as T;
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, payload?.error ?? res.statusText, res.headers.get("retry-after"));
  return payload as T;
}
```

### 9.4 Query keys and invalidation
`["library","page",cursor]`, `["library","item",id]`, `["folders"]`, `["feeds"]`, `["feeds","entries",view,feedId]`, `["shelves","counts"]`, `["shelves",type,filters]`, `["shelves",type,id]`, `["trips"]`, `["trips",id]`, `["extracts"]`, `["extracts",id,"results"]`. Library data is also mirrored to SQLite (source of truth for UI) — queries feed SQLite, UI reads SQLite via `useLiveQuery`-style hooks.

### 9.5 Reader bridge protocol (WebView ⇄ native)

Native → Web: `setPrefs`, `setHighlights(list)`, `scrollToHighlight(id)`, `setProgress(fraction)`, `speakHighlight(paragraphIndex)`.
Web → Native: `ready`, `progress{fraction}`, `selection{text, rect}`, `selectionCleared`, `highlightTap{id, rect}`, `linkTap{url}`, `imageTap{src}`, `paragraphs{count}`.
All messages JSON `{type, ...}`; validate with Zod on the native side; ignore unknown types.

### 9.6 Trip chat streaming
`POST /api/trips/:id/chat` streams an AI-SDK UI message stream (the web uses `useChat` from the Vercel AI SDK; see `src/components/trips/trip-chat.tsx` and `src/server/services/trip-agent.ts` for the exact request body and stream format — **VERIFY**).
- Use `@ai-sdk/react`'s `useChat` with a custom `fetch` that injects the bearer token and `expo/fetch` (supports streaming on RN). If `useChat` is problematic in RN, parse the SSE stream manually.
- Send only the new user message text + chosen model id (as web does). Server stores history; load with `GET`.
- Show tool-status chips from streamed tool parts; refetch `["trips",id]` after any write tool completes; allow cancel (abort) — the server still finishes and saves the turn (`consumeStream`).
- Handle `429` (agent bucket, 40/h) with a friendly message.

### 9.7 Contract drift protection
Add `mobile/scripts/check-contract.mjs` that reads `src/lib/api/types.ts`, `src/lib/api/*.ts` exported type names and `src/lib/store.ts` `LibraryItem` keys, and fails CI if a mobile mirror is missing a field (simple key comparison is enough). Run in the mobile test script.

### 9.8 Environment variables (`mobile/.env.example`)
```
EXPO_PUBLIC_API_URL=http://192.168.x.x:8080
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_SENTRY_DSN=            # optional
```

---

## 10. Error handling and empty states

| Situation | Behaviour |
|---|---|
| Offline | Banner; reads from cache; writes queue; capture shows "will save when online" |
| 401 | One silent token refresh+retry; else sign out |
| 403 | Treat as bug: toast "Request blocked", log in Diagnostics (indicates CSRF/same-site misconfig) |
| 404 on item | Remove from local cache, toast "No longer available" |
| 409 | Refetch the entity and re-apply user intent once; else surface |
| 413/415/400 | Show server `error` text; mark outbox item failed (not retried) |
| 429 | Respect `Retry-After`; pause that bucket; toast |
| 5xx / network | Retry with backoff (GET) / outbox backoff (writes); non-blocking error state with Retry |
| Extraction failed | CAP-3 |
| Empty library/feeds/shelves | Single-line friendly text + primary action |

All user-facing strings come from the server `error` where available (it is already user-facing) otherwise from the i18n map; never show raw stack traces or JSON.

---

## 11. Testing and quality

- **Unit (Jest):** URL normalisation, outbox coalescing/backoff, highlight op reducers (port `applyHighlightOps`/`applyTagOps` tests from `src/lib/item-ops.ts` behaviour), library filtering/sorting, paper-tone/theme tokens, trip date math, API client error mapping.
- **Component (RNTL):** ArticleRow, Reader prefs sheet, highlight toolbar, Capture field states, Feed entry actions.
- **Reader engine:** run the injected highlight script under jsdom with fixtures (nested inline tags, repeated phrases, entities, whitespace differences). Target ≥ 20 fixtures.
- **Integration:** mock server (MSW) covering success/401/429/offline flows; outbox replay order.
- **E2E (Maestro):** sign-in (test account), save URL, open article, highlight, archive, airplane-mode edit then reconnect, shelf add + episode toggle.
- **Manual device matrix:** iPhone SE/15, Pixel 6/8 + a low-end Android; light/dark; font scale 200%; VoiceOver/TalkBack smoke.
- **CI:** lint, typecheck, unit/component tests for `mobile/` on PR; EAS preview build on `main`.
- **Definition of done (any feature):** AC met, tests added, no new lint/type errors, accessible labels, light+dark checked, offline behaviour defined and tested, strings via `t()`.

---

## 12. Milestones

| M | Deliverable | Key acceptance |
|---|---|---|
| **M0** | Backend readiness (§4) + `docs/API.md` + `docs/mobile/NOTES.md` | §4.6 checklist |
| **M1** | Expo scaffold, theme tokens, navigation shell, Clerk auth, API client, tabs with placeholders, CI | Sign in/out works against local backend; `GET /api/library` renders raw count |
| **M2** | Library (SQLite, sync, list, filters, search, actions, folders, tags) + Home capture by paste | LIB-1…8, CAP-1…5 |
| **M3** | Reader (WebView, prefs, highlights, progress, offline cache, images) | RDR-1…7, 9, 10 |
| **M4** | Outbox/offline hardening + Share extension/intent + Vault | CAP-4/6, §7.2, VAULT |
| **M5** | Feeds | FEED-1…8 |
| **M6** | Shelves | SHELF-1…7 |
| **M7** | TTS, Trips (+chat), Extracts, Settings polish, export | RDR-8, TRIP, EXT, SET |
| **M8** | Accessibility pass, performance pass, store assets, privacy policy link, EAS production builds, TestFlight/Play internal testing | DESIGN §9–10 budgets, store checklists |

Order can swap M5/M6 with owner approval. Each milestone = one or more PRs; don't mix milestones in a PR.

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Bearer auth not accepted by `clerkMiddleware`/CSRF middleware | M0 spike first; fallbacks in §4.1–4.2 |
| iOS Share Extension can't access Clerk token | App Group handoff fallback (CAP-6) |
| Highlight text-anchoring ambiguity / drift when HTML changes | RDR-6 rule; keep `text` exact; log un-anchorable highlights (show in sheet as "couldn't locate in text") |
| Large HTML in WebView memory | Chunk very large articles (> 1.5 MB) with progressive injection; test with 50k-word fixtures |
| Image proxy auth on RN | §4.3 options; prefetch to disk |
| API drift between web and mobile | §9.7 check; mention mobile in `docs/CONTRIBUTING.md` API-change checklist |
| Rate limits during bulk offline replay | Outbox pacing (max 2 concurrent, honour 429) |
| App Store review (account deletion, Sign in with Apple, UGC/web content) | Checklist in M8; owner decisions in §15 |
| Journal parity expectation | Explicit non-goal; revisit when server sync returns |

---

## 14. Future (not v1)
Delta sync endpoint with tombstones; reading-progress sync (needs a column); push notifications for feeds (needs scheduled polling); iOS/Android widgets (recent reads); Apple Watch/Wear OS TTS remote; OPML/Goodreads imports; biometric lock; iPad/tablet split view; Journal (when server sync returns); in-reader dictionary/translate.

---

## 15. Decisions needed from the owner (ask before the affected milestone)

1. **Production API URL and Clerk production publishable key**; is `kami.sahilfruitwala.com` the app origin? (M1)
2. **Bundle ID / package name** and Apple/Google developer accounts. Suggested `com.sahilfruitwala.kami`. (M1, M8)
3. **Enabled Clerk sign-in methods**; add Google/Apple OAuth redirect schemes for the mobile app in Clerk. (M1)
4. **Shared code strategy** (§9.2 option 1 vs 2). Default option 1.
5. **App icon / splash assets** and store listing copy. (M8)
6. **Privacy policy & terms URLs**; account-deletion path acceptable to Apple. (M8)
7. **Crash reporting** (Sentry) yes/no. Default no.
8. Whether to ship **Trips/Extracts** in v1 or hold to v1.1 to reduce review surface. Default: ship.
