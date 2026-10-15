# Architecture

How KAMI (package name **quarto**) is put together — so you can change one layer without breaking another.

## Mental model

```
Browser (React + Zustand + React Query)
        │  fetch /api/* JSON (src/lib/api)
        ▼
src/routes/api/*  ──apiHandler (src/server/http.ts)──►  userId
        │
src/server/services/*  (business logic)
        │
        ├─ Drizzle → Postgres (DATABASE_URL)
        ├─ extract.server.ts → Readability / Jina / X APIs
        └─ cache.server.ts → Upstash Redis (optional)
```

Signed-in users pass **`AppGate`**, which loads a per-user library + journal snapshot into **Zustand**. Mutations update the store immediately and sync through the **REST API (`/api/*`) + Drizzle**, always scoped by Clerk **`userId`**. Shelves skip the optimistic store and use **React Query**. Article HTML is produced only on the server.

---

## System context

```mermaid
flowchart TB
  subgraph Client
    UI[React routes + components]
    Z[Zustand — library / journal / prefs]
    RQ[React Query — shelves / lookups]
  end

  subgraph Start["TanStack Start (Vite / Nitro)"]
    CSRF[CSRF middleware]
    ClerkMW[Clerk middleware]
    SFNs["/api/* routes → services<br/>src/server/services"]
    Extract[extract.server.ts]
    Img["/api/img proxy"]
  end

  subgraph Data
    PG[(Postgres / Neon)]
    Redis[(Upstash Redis)]
  end

  subgraph External
    Clerk[Clerk]
    TMDB[TMDB]
    OL[Open Library]
    Jina[Jina Reader]
    FX[fxtwitter / X helpers]
  end

  UI --> Z
  UI --> RQ
  UI --> CSRF --> ClerkMW --> SFNs
  SFNs --> PG
  SFNs --> Redis
  SFNs --> Extract
  Extract --> Jina
  Extract --> FX
  RQ --> SFNs
  Z --> SFNs
  SFNs --> Clerk
  SFNs --> TMDB
  SFNs --> OL
  Img --> Clerk
```

---

## Request lifecycle

```mermaid
sequenceDiagram
  participant B as Browser
  participant S as Start middleware
  participant F as /api route + apiHandler
  participant D as Drizzle / DB
  participant R as Redis (optional)

  B->>S: fetch /api/… / navigation
  S->>S: CSRF (/api/* only)
  S->>S: clerkMiddleware
  B->>F: e.g. GET /api/library
  F->>F: assertSameSiteRequest + JSON content-type
  F->>F: requireUserId → userId, rate limit, Zod parse
  alt cache hit
    F->>R: GET quarto:v1:u:&lt;id&gt;:…
    R-->>F: payload
  else miss / no Redis
    F->>D: SELECT … WHERE user_id = userId
    D-->>F: rows
    F->>R: SET (if enabled)
  end
  F-->>B: JSON (errors as { error } + status)
  Note over B: Library/journal hydrate Zustand;<br/>shelves hydrate React Query
```

---

## Layering

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Routes | `src/routes/*.tsx` | URL, search params, compose shell + page |
| UI | `src/components/**` | Presentation; call hooks / stores / `src/lib/api` |
| Hooks | `src/hooks/**` | Capture, filters, shelf queries |
| Domain | `library-item.ts`, `item-ops.ts`, `id.ts` | Isomorphic types, size limits, pure helpers — shared by client and server; never imports the store |
| Client state | `store.ts`, `journal.ts`, `*-remote.ts` | Optimistic library/journal + offline outbox |
| API client | `src/lib/api/**` | Typed `fetch` wrappers + shared request/response types |
| HTTP routes | `src/routes/api/**` | Method + path → service call; no business logic |
| HTTP layer | `src/server/http.ts` | Auth, same-site, rate limit, Zod, error → status |
| Services | `src/server/services/**` | Business logic, DB reads/writes, cache invalidation |
| Server-only | `*.server.ts` | Node/ALS code that must not ship to the browser |
| Schema | `schema.ts` + `migrations/*.sql` | Source of truth for tables |
| Bootstrap | `start.ts`, `router.tsx`, `__root.tsx` | Middleware, router, providers |

### File naming conventions

| Pattern | Meaning |
|---------|---------|
| `src/routes/api/**` | REST endpoints (see [API reference](./API.md)) |
| `src/server/**` | Server-only (guarded by `@tanstack/react-start/server-only`) |
| `*-remote.ts` | Client sync / bootstrap / outbox |
| `*.server.ts` | Server-only module — never import from client components |
| `migrations/NNNN_*.sql` | Ordered SQL; basename recorded in `_migrations` |
| `@/` alias | Maps to `src/` |

Package/repo identifiers often say **quarto** (`quarto-library` localStorage key, `quarto:v1` Redis prefix, Docker `quarto-pg`). Product copy says **KAMI**.

---

## Auth & isolation

```mermaid
flowchart LR
  A["Incoming /api/* request"] --> B[assertSameSiteRequest]
  B --> C[requireUserId via Clerk auth]
  C --> D[ensureLocalUser upsert]
  D --> E["All queries: eq(userId, userId)"]
```

Rules that must not be broken:

1. **Never trust a client-supplied user id** — only the `userId` `apiHandler` resolves from Clerk.
2. Scope every read/write with that id (or list ownership / membership for shelves).
3. `VITE_AUTH_ENABLED=false` is fail-closed — every request is rejected. Use Clerk for local dev.
4. Global middleware in `src/start.ts`: CSRF for `/api/*` + `clerkMiddleware()`.
5. Per-endpoint: every JSON route is wrapped in `apiHandler` (`src/server/http.ts`), which also requires an `application/json` body on writes.

UI gates: `AppGate`, Clerk `Show`, `/login`. Image proxy `/api/img` also checks Clerk when auth is enabled.

---

## Client state split

```mermaid
flowchart TB
  subgraph Zustand
    Lib[Articles / folders / highlights]
    Jrn[Journal entries]
    Prefs[Reader prefs / theme]
  end

  subgraph ReactQuery
    Shelf[Shelf lists / counts / detail]
    Lookup[TMDB / Open Library / link preview]
  end

  Lib <-->|library-remote outbox| SF1["/api/library, /api/articles"]
  Jrn <-->|journal-remote| SF2["/api/journal"]
  Shelf <-->|invalidate on mutate| SF3["/api/shelves"]
  Lookup --> SF4["/api/lookup"]
```

| Domain | Store | Why |
|--------|--------|-----|
| Library + highlights | Zustand + outbox | Large HTML bodies, optimistic UI, offline |
| Journal | Zustand + outbox | Same pattern |
| Shelves | React Query | Server-authoritative lists, easy invalidation |
| Lookups | React Query | External APIs with TTLs |

---

## Article capture pipeline

```mermaid
flowchart TD
  A[Paste URL / share sheet / bookmarklet / extension / paste HTML] --> B{Source}
  B -->|URL| C[POST /api/articles/extract]
  B -->|HTML| D[POST /api/articles/import]
  B -->|link only| E[POST /api/articles/link]
  C --> F{Classify}
  F -->|web| G[SSRF-safe fetch → site rules e.g. Substack → Readability]
  F -->|X| H[fxtwitter / helpers]
  G -->|fail| I[Jina Reader fallback]
  H --> J[Normalized article]
  G --> J
  I --> J
  D -->|captured page| G
  D -->|pasted HTML/text| J
  E --> J
  J --> K[Optimistic Zustand + POST /api/library/items]
  K --> L[invalidateUserCache]
```

Extraction lives in `src/lib/extract.server.ts`. Public URL checks and redirect handling are intentional security surfaces — tighten, don’t bypass.

Site rules run before Readability when a site's markup is known: `src/lib/extract-substack.server.ts` takes Substack's `.body.markup` directly (custom domains included) and strips subscribe widgets / share buttons, unwraps image links, renders footnotes and embeds, and notes paywalled tails. Add new site rules alongside it.

### Browser capture handoff

The bookmarklet and the `extension/` browser extension capture the page in the user's browser and hand it to `/capture` with `postMessage` — never in a URL, so long articles aren't truncated:

1. `/capture` pings `kami:ready` to its opener (bookmarklet popup) and to itself (extension content script).
2. The sender answers with `kami:capture` + `{ url, title, html }` (scripts/styles stripped, ≤ 1.4 MB).
3. `/capture` accepts it only from its opener **for the opener's own origin**, or from same-origin/extension script; stashes it in `sessionStorage` and routes to `/app`, which imports it once the session is confirmed (`POST /api/articles/import` with `capture: true` → full extraction).

There is no URL-carried capture: the old `?import=<base64>` links were removed because any site could link one and plant content (with a forged source URL) in a reader's library.

`/share` is the PWA Web Share Target (`site.webmanifest`): it takes the first URL from `url`/`text` and **pre-fills** Home's save box (`/app?save=`). Saving always takes the reader's tap — any site can link to `/share`, so arriving there must not change the library.

### Saving a link (web and native clients)

`POST /api/library/save` `{ url, linkOnly? }` is the one save-by-URL path. The server fetches and extracts the page (SSRF-guarded, `extract` rate limit) and stores the clean copy, returning `{ ok: true, item, existed }` or `{ ok: false, error }`. A URL already in the library comes back untouched (`existed: true`) — tags, highlights and notes are never reset by a re-save. Clients send only the URL, never article HTML.

A future phone app uses the same endpoints as the web app:

- **Auth:** send the Clerk session token as `Authorization: Bearer <token>`. `requireUserId` accepts session tokens only (not API keys or machine tokens).
- **CSRF:** Bearer requests skip the cookie CSRF middleware (a browser can't attach that header cross-site without a preflight), and native clients send no `Sec-Fetch-*` headers, so the same-site check passes.
- **Share sheet:** a native share extension should call `POST /api/library/save` directly instead of opening `/share`.
- **Images:** `/api/img?u=` accepts the same Bearer token.

---

## Feeds & newsletters

`/feeds` follows RSS, Atom and JSON Feed sources and email newsletters. New
entries collect in a lightweight inbox, and saving one turns it into a normal
library work that you can read, highlight and keep.

### Design goals

You can follow hundreds of feeds without the server doing much work.

| Concern | How it's handled |
|---|---|
| Duplicate work | Feeds are **shared rows**. A blog followed by 100 readers is one row and one poll. Only feeds with at least one subscriber are ever polled. Unfollowed feeds are deleted with their entries. |
| Double polling | A poll **claims** feeds with `FOR UPDATE SKIP LOCKED` and pushes `next_fetch_at` forward 10 minutes as a lease. Overlapping refreshes, tabs or instances never fetch the same feed twice. If a run dies, the lease expires and the feed comes due again. |
| Bandwidth | Polls send a **conditional GET** (`If-None-Match` / `If-Modified-Since`), so an unchanged feed costs a `304` with no body. |
| Poll frequency | **On demand only**: nothing polls in the background. Each feed still tracks an adaptive schedule (the interval halves after new posts and grows 1.5× when nothing changed, between 30 minutes and 12 hours; publisher hints like `<ttl>`, `Cache-Control: max-age` and `Retry-After` can only lengthen it). The optional sweep hook uses that schedule. |
| Broken feeds | **Exponential backoff** on errors: 30 min, 1 h, 2 h, and so on up to 24 h. "Refresh all" skips a failing feed until its backoff ends; refreshing that one feed retries it. The last error is shown in the UI, and it clears after the next good poll. |
| Burst cost | Every run has a **feed cap, a concurrency cap and a wall-clock deadline**. Leases on feeds it didn't reach are released. Bodies are streamed under a 3 MB cap with a per-request timeout. |
| Manual refresh | The Refresh button never re-polls a feed checked in the last 5 minutes. Each request polls at most 20 feeds (5 at a time, 6-second budget) and reports how many remain; the client repeats up to 8 batches. It shares the `feeds` rate-limit bucket with adding feeds and importing OPML (60 per 10 min per user). |
| Saving | Entries keep the body the feed supplied, stored raw and capped. **Full-text feeds save with no network call at all**: the body is sanitized and built into an article on save. Only teaser feeds (under 150 words) fetch the page, once, through the normal extractor and its `extract` rate limit. |
| Storage | 100 entries are kept per feed, newest first. Read state is one row per explicit mark. "Mark all read" is a single timestamp per subscription. |
| Discovery | A known feed URL needs no fetch. A feed URL needs one fetch. A page needs its `<link rel="alternate">` feeds (up to 3), and only after that a few conventional paths, probed in parallel. OPML import registers feeds **without fetching**; the next Refresh fetches them. |
| SSRF | Every fetch goes through `safeFetch` (`src/lib/fetch-text.server.ts`), which re-validates each redirect hop against the private-address denylist and DNS. |

Unread means: no per-user mark, fetched after the subscription's `cleared_at`,
and published no more than 14 days before you subscribed. Following a blog with
years of archives therefore shows recent posts as unread, not the whole archive.

### When polling happens

Only when a user asks. There is **no cron and no automatic polling**:

- **Refresh all** on `/feeds` fetches every feed you follow that wasn't checked in the last 5 minutes, in batches of 20.
- **Refresh feed** (with one feed selected) fetches just that feed, retrying it even while it's failing.
- **Adding a feed** fetches it once while finding it, so its entries appear immediately.

Opening `/feeds` only reads what is already stored. Newsletters need no polling, since they arrive by email.

A sweep endpoint, `GET /api/hooks/feeds`, is kept for later but **nothing schedules it**. It polls every due subscribed feed on its adaptive schedule (up to 80 per run, 6 at a time, 25-second budget). It only answers when `CRON_SECRET` (16+ characters) is set and sent as `Authorization: Bearer …`; otherwise it returns `503`. To bring scheduled polling back, add a Vercel cron for it through Nitro's Vercel options in `vite.config.ts` (`nitro({ preset: "vercel", vercel: { config: { crons: [...] } } })`) or call it from any external scheduler.

### Newsletters by email

Each user can create a private address, `<token>@INBOUND_EMAIL_DOMAIN`. Mail
sent to it (plus-addressing like `token+brew@…` also works) is delivered to
`POST /api/hooks/inbound-email` by an inbound-mail provider:

- Each **sender** becomes a private feed, owned by that user and never shared.
- Tracking pixels and hidden preheader text are stripped. The "View in browser" link becomes the entry's URL.
- Nothing is polled. Unknown addresses, duplicates (same `Message-ID`) and floods over 300 per user per day are acknowledged with a `2xx` and dropped, so the provider doesn't retry them.
- Removing a sender deletes its feed. If the newsletter keeps mailing, the next issue starts a new one, so unsubscribe at the source too.
- "New address" rotates the token. Mail to the old address is dropped from then on.

Environment:

```bash
INBOUND_EMAIL_DOMAIN=in.example.com   # MX/route for this domain → your provider
INBOUND_EMAIL_SECRET=<32+ random chars>
```

Two common providers can send to the webhook:

**Postmark inbound**: set the inbound webhook URL to
`https://postmark:<INBOUND_EMAIL_SECRET>@your-app/api/hooks/inbound-email`. The
Basic-auth password is the secret. Postmark's JSON is accepted as is.

**Cloudflare Email Routing** (free): route `*@in.example.com` to an Email
Worker that forwards a small JSON payload:

```js
// worker.js — npm i postal-mime
import PostalMime from "postal-mime";

export default {
  async email(message, env) {
    const mail = await PostalMime.parse(message.raw);
    const res = await fetch(`${env.KAMI_URL}/api/hooks/inbound-email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.INBOUND_EMAIL_SECRET}`,
      },
      body: JSON.stringify({
        to: message.to,
        // Header From, not the envelope (bounce) sender, which changes per message.
        from: mail.from?.address ?? message.from,
        fromName: mail.from?.name,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        date: mail.date,
        messageId: mail.messageId,
      }),
    });
    if (!res.ok) message.setReject(`KAMI returned ${res.status}`);
  },
};
```

Any other provider works if it posts the same generic shape:
`{ to, from, fromName?, subject?, html?, text?, date?, messageId? }`.

Many newsletters (Substack, Ghost, Buttondown, beehiiv) also publish RSS. Following
the newsletter's site as a feed needs no email setup at all.

### Code map

| Path | Role |
|---|---|
| `src/lib/feed-parse.server.ts` | RSS 2.0 / RDF / Atom / JSON Feed parsing, feed discovery (pure, tested) |
| `src/lib/feed-schedule.ts` | Interval, backoff, jitter and header-hint math (pure, tested) |
| `src/lib/newsletter-parse.server.ts` | Inbound payload normalization, tracking-pixel stripping (pure, tested) |
| `src/server/feeds/poller.ts` | Claim → conditional fetch → parse → insert → reschedule |
| `src/server/feeds/newsletter.ts` | Inbound email → private sender feed |
| `src/server/services/feeds.ts` | Subscriptions, entries, read state, save-to-library, inbox, OPML |
| `src/server/hooks.ts` | Shared-secret auth for `/api/hooks/*` (exempt from browser CSRF) |
| `src/routes/api/feeds/**`, `src/routes/api/hooks/**` | HTTP routes |
| `src/hooks/use-feeds.ts`, `src/components/feeds/*` | `/feeds` UI (React Query) |
| `migrations/0009_feeds.sql` | `feeds`, `feed_subscriptions`, `feed_entries`, `feed_entry_states`, `newsletter_inboxes` |

---

## Extracts (Firecrawl)

`/extracts` asks a web page a question and keeps the answers you approve. For
example: *Product Hunt — "the best products launched this week and this month,
with name, link and category"*.

1. **Save a source**: a URL plus a plain-English question (and an optional name).
   Sources are private to one user, up to 50 each.
2. **Run it** (on demand only — nothing is scheduled). The server calls
   Firecrawl `POST /v2/scrape` with the [`question` format](https://www.firecrawl.dev/blog/question-format-launch):

   ```json
   {
     "url": "https://www.producthunt.com/",
     "onlyMainContent": true,
     "maxAge": 172800000,
     "parsers": ["pdf"],
     "formats": [{ "type": "question", "question": "…" }]
   }
   ```

   **Run** reuses Firecrawl's cached copy of the page when it is under 2 days old
   (cheaper, faster). **Run live** sends `maxAge: 0` for a fresh fetch.
3. **Review**: the Markdown answer is stored as the source's single `pending`
   result and shown rendered. **Accept** keeps it in the source's history;
   **Discard** deletes it. Running again before reviewing replaces the pending one.

| Concern | Approach |
|---|---|
| Cost | Every run spends Firecrawl credits, so runs share a `firecrawl` rate-limit bucket (30 per hour per user). Nothing runs on page load. |
| Key | One server-wide `FIRECRAWL_API_KEY`; never sent to the browser. Without it the page explains the setup and Run is disabled. |
| Rendering | Answers are stored as raw Markdown and rendered with `markdownToHtml` + `sanitizeHtml` on read, so the browser only ever receives sanitized HTML (plus the Markdown for "Copy Markdown"). |
| Failures | A failed run records `last_error` on the source (shown in the UI) and keeps any earlier pending result. Upstream auth / credit errors are reported generically. |
| URLs | Same public-http(s) check as article capture (`assertPublicHttpUrl`); the fetch itself happens on Firecrawl's side. |

| Path | Role |
|---|---|
| `src/lib/firecrawl.server.ts` | Request builder, response parser (pure, tested), `askPage` |
| `src/server/services/extracts.ts` | Sources, runs, accept / discard, history |
| `src/routes/api/extracts/**` | HTTP routes |
| `src/hooks/use-extracts.ts`, `src/components/extracts/*` | `/extracts` UI (React Query) |
| `migrations/0010_extracts.sql` | `extract_sources`, `extract_results` |

---

## Trips

`/trips` is a private trip planner: a list of trips, and per trip a board with
the details (destination, start date, length, travellers, budget, what you
like), a **hotel shortlist**, and a **day-by-day itinerary**. Planning is
manual: there is no chat agent.

| Concern | Approach |
|---|---|
| Dates | A trip stores `start_date` (optional) and `day_count` (1–30); the end date is derived, so the two can't disagree. Date math is UTC on `YYYY-MM-DD` strings (`src/lib/trip-days.ts`, tested). |
| Itinerary | Items carry a 0-based `day_index` and a `slot` (`morning` → `night`), ordered by day, slot, then `sort`. Moving an item to another day or slot puts it at the end there; the up/down buttons swap it with its neighbour inside the same day + slot (`POST /api/trips/:id/items/:itemId/move`). A trip can't be shortened past a day that still has plans. |
| Map & times | Items and hotels have optional `lat`/`lng`; items also have an optional `start_time` ("HH:MM", destination-local) and `duration_min`, with the slot's default time standing in when they're missing. "Pin places on the map" (`POST /api/trips/:id/locate`) geocodes up to 6 unpinned places per call through Nominatim, 1.1 s apart, counting against the `lookup` rate limit; places it can't find come back as `missedIds` and the client skips them on the next call. Changing a plan's place text drops its old pin. One trip map above the itinerary (OpenStreetMap via Leaflet, loaded in the browser only) shows either all days, each in its own fixed color with pins labelled by day, or one picked day with numbered stops, plus the chosen hotel; each day card's "Show on map" picks that day. Day colors (`src/lib/trip-colors.ts`) are a validated categorical palette in fixed order, with days past the eighth in neutral gray. The board also shows a straight-line distance and rough travel time between pinned stops, and warnings for long hops (> 15 km), packed days (> 12 h of timed plans and travel) and overlapping start times (`src/lib/trip-route.ts`). The `.ics` export uses real start times and durations when set. |
| Hotels | `shortlisted` or `chosen`; choosing one demotes the previous pick in the same transaction, and a partial unique index allows only one `chosen` per trip. Prices and ratings are free-text notes, never live data. |
| Writes | Every write returns the whole updated trip; the client swaps it into the React Query cache. Each write also bumps `trips.updated_at` so the list sorts by recent activity. |
| Limits | 50 trips per user, 30 hotels and 300 items per trip. Links go through `assertPublicHttpUrl`. |

| Path | Role |
|---|---|
| `src/lib/trip-days.ts` | Date math, day grouping, item order, move-within-slot (pure, tested) |
| `src/lib/trip-route.ts` | Slot default times, distances, travel estimates, day warnings (pure, tested) |
| `src/lib/geocode.server.ts`, `src/server/services/trip-locate.ts` | Nominatim client (pure parts tested) and the batched "Pin places" service |
| `src/components/trips/trip-map.tsx`, `src/lib/trip-colors.ts` | Leaflet trip map (one or many days) and the per-day colors |
| `src/lib/trip-ics.ts` | Itinerary → `.ics` calendar text, built in the browser for the "Add to calendar" button (pure, tested) |
| `src/server/services/trips.ts` | Trips, hotels, itinerary items |
| `src/routes/api/trips/**` | HTTP routes  |
| `src/hooks/use-trips.ts`, `src/components/trips/*`, `src/routes/trips/*` | `/trips` UI |
| `migrations/0012_trips.sql` | `trips`, `trip_hotels`, `trip_items` (`0013`/`0014` added `trip_messages` / `trip_snapshots` for the removed agent; the tables are left in place, unused) |

---

## AI features

Optional AI helpers across the library. They are hidden in the UI until
`GET /api/ai/status` reports a usable model (at least one of
`GOOGLE_GENERATIVE_AI_API_KEY` / `OPENROUTER_API_KEY`).

| Concern | Choice |
|---|---|
| Models | `AI_MODELS` (default `google:gemini-3.8-flash`, then `openrouter:anthropic/claude-haiku-5.5`). `aiLanguageModel()` in `llm.server.ts` wraps the models that have a key in one `fallbackModel` (`src/lib/model-fallback.ts`): each call tries Google first and moves to Claude Haiku when Google errors (bad key, quota, outage). Streams fail over only while they are being set up, never mid-reply. The model that answered is recorded with each result. |
| Calls | `src/server/ai.ts`: `generateJson` (zod schema → structured output). Low temperature, one SDK retry per model, provider errors mapped to friendly 502/503s. |
| Untrusted text | Articles, feed entries and page text go into prompts wrapped in `<document>` tags, and every system prompt says to treat them as data, never instructions. |
| Cost | `ai` rate-limit bucket (300 calls/hour/user). Results are cached where it makes sense and regenerated only on request. Article text is clipped to ~24k characters. |

### Article summaries

The reader's margin has a **Gist** card: a TL;DR, three to six key points,
and suggestions to add tags (from the user's own tag vocabulary, most used
first) and file it in an existing folder. Generated on demand
(`POST /api/ai/articles/:id/summary`) and cached in `article_ai`, keyed by
article, with a sha256 of the body it was made from. When the text changes
(a link stub upgraded to a clean copy), the card shows the old summary as
stale until it is regenerated.

### Feeds: entry summaries

Each entry card on `/feeds` has a **Summary** toggle (`POST
/api/ai/feeds/entries/:id/summary`): a TL;DR and key points from the
entry's own text, ignoring newsletter sponsor blocks and footers. Teasers
under 60 words are refused (open the entry instead). Cached in `ai_notes`
(kind `entry-summary`, newest 300).

### Tidy this copy

The reader's Gist card has **Remove ads & clutter** (`POST
/api/ai/articles/:id/tidy`) for newsletters and cluttered pages. The saved
HTML is split into numbered top-level blocks (descending through lone
layout wrappers, `src/lib/tidy-html.server.ts`), the model gets a short
preview of each and returns the numbers of ads, sponsor slots, subscribe /
share / referral prompts, footers and navigation. The text itself is never
rewritten, and a result that would drop 60% or more of the blocks is
refused.

The endpoint saves nothing. It returns the original and the tidied HTML plus
a preview of each removed block, and the reader opens a **review dialog**
(`src/components/reader/tidy-review.tsx`) showing Before and After side by
side (tabs on narrow screens) with the list of what goes. Only **Save tidy
copy** writes the change, through the normal library upsert; **Keep
original** (or closing the dialog) leaves the article untouched. After a
save the toast still offers Undo.

### Shelf suggestions

Movie, TV and book shelves have **Suggest** (`POST
/api/ai/shelves/recommend`): the model sees up to 150 shelf items with
their status (finished items show taste, "gave up" what to avoid, queued
ones aren't repeated) and suggests ten titles with a reason naming
something on the shelf. Titles already on the shelf are dropped, and the
first eight are matched against TMDB / Open Library (same search as the add
dialog) so **Add to shelf** saves a cover and metadata in one tap. Nothing
is stored.

### Extraction fallback

When Readability finds nothing on a fetched page, extraction used to keep
the page's first 4,000 characters of text (menus and all). With AI set up,
`extractArticleFromUrl` first tries `aiExtractFallback`: the page's
readable blocks (headings, paragraphs, list items, quotes, code, figures,
tables; page chrome dropped) are numbered, and the model returns the ranges
that form the piece. The article is rebuilt from those blocks as-is, so the
model never writes its text. It runs for single saves (`/api/articles/extract`,
including the reader's link-stub upgrade, and saving a feed entry), not bulk
saves; counts one call against the `ai` bucket; and steps aside (to the old
behaviour) when AI is off, over budget, or the page isn't an article.

### Summarize before saving (extension)

The browser extension adds **Summarize page with KAMI** (page context menu,
**Alt+Shift+S**). It captures the tab exactly like Save, but opens
`/capture?intent=peek`, which routes to `/peek` instead of Home. `/peek`
(inside the app shell, so after sign-in) takes the stashed page and calls
`POST /api/ai/peek`: the page goes through the same extraction as a capture
and the model returns a TL;DR, key points and a one-line verdict. Nothing is
stored. **Save to library** re-stashes the page and hands it to Home's normal
capture flow; **Skip** closes the tab.

| Path | Role |
|---|---|
| `src/lib/model-fallback.ts` | Fallback model chain, prompt clipping (pure, tested in `tests/ai.test.mjs`) |
| `src/lib/ai-models.ts`, `src/lib/llm.server.ts` | `AI_MODELS` parsing (pure, tested) and provider wiring for the chain |
| `src/server/ai.ts` | Shared generation helpers and error mapping |
| `src/server/services/ai-articles.ts` | Summaries, tag vocabulary, article-to-prompt helpers |
| `src/routes/api/ai/**` | HTTP routes |
| `src/components/reader/reader-ai.tsx`, `src/components/reader/tidy-review.tsx` | Reader Gist card; Tidy before/after review |
| `src/server/services/ai-notes.ts`, `src/hooks/use-ai.ts` | The `ai_notes` store; status + auto-organize hooks |
| `src/server/services/ai-feeds.ts`, `src/components/feeds/feed-ai.tsx` | Feed entry summaries |
| `src/lib/tidy-html.server.ts` | Block splitting for Tidy and page block collection for the extraction fallback (tested) |
| `src/server/services/ai-extract.ts`, `src/routes/peek.tsx` | Extraction fallback; page peek for the extension |
| `src/server/services/ai-shelves.ts`, `src/components/library/shelf-recs.tsx` | Shelf suggestions |
| `migrations/0016_article_ai.sql`, `0017_ai_embeddings.sql`, `0018_ai_notes.sql` | `article_ai`, `ai_embeddings` (left over from the removed semantic search; unused), `ai_notes` |

---

## Caching

`src/lib/cache.server.ts` — enabled only when both Upstash env vars are set.

- Key shape: `quarto:v1:u:<userId>:…`
- Read-through via `cached()` on per-user keys built with `userFeatureKey(userId, feature, …)`; writes call `invalidateUserCache(userId, feature)`, which drops only that feature ("library" | "shelves" | "journal") for that user
- Oversized library snapshots skip cache
- Lookups (TMDB, books, previews) use longer TTLs

Locally (no Redis): every query hits Postgres — expected.

---

## Routing & shell

```mermaid
flowchart TB
  Root["__root.tsx<br/>QueryClient + Clerk + theme"]
  Root --> Index["/ — Landing or desk"]
  Root --> Lib["/library — AppShell"]
  Root --> Feeds["/feeds — AppShell"]
  Root --> Trips["/trips, /trips/$id — AppShell"]
  Root --> Read["/read — AppGate only"]
  Root --> Movies["/shelves/movies — AppShell"]
  Root --> Series["/shelves/series — AppShell"]
  Root --> Books["/shelves/books — AppShell"]
  Root --> Wishlist["/shelves/wishlist — AppShell"]
  Root --> Journal["/journal — AppShell"]
  Root --> Vault["/vault — AppShell"]
  Root --> Settings["/settings — AppShell"]
  Root --> Login["/login"]
  Root --> Img["/api/img"]
```

- **`AppShell`**: header, nav panes, command palette, offline banner.
- **`AppGate`**: wait for auth + bootstrap library/journal once per user.
- **`/read`**: immersive — gate without full chrome.

File routes under `src/routes/` regenerate `src/routeTree.gen.ts` via the Vite router plugin. Do not hand-edit the generated tree.

---

## Build & deploy

```mermaid
flowchart LR
  Dev["pnpm dev<br/>with-app-env → Vite :8080"] --> Code
  Code --> Build["pnpm build"]
  Build --> Vite[vite build + Nitro vercel]
  Vite --> Migrate[db:migrate against DATABASE_URL]
  Migrate --> Vercel[Vercel serverless]
```

`vercel.json` sets the static security headers (`X-Frame-Options`, `nosniff`, referrer and permissions policies; `/api/img` gets its own locked-down CSP). The page CSP is built in `src/lib/csp.ts` and attached to every HTML response by `cspMiddleware` in `src/start.ts` with a fresh nonce; the router passes that nonce (`ssr.nonce`) to TanStack's hydration scripts, Clerk's init state and the theme script, so `script-src` needs no `'unsafe-inline'`. It allows Clerk (including the production Frontend API host `clerk.kami.sahilfruitwala.com`, Clerk CDN, Cloudflare Turnstile, and `*.protect.clerk.com`). Outbound fetches of user URLs go through `publicFetch` (`src/lib/safe-url.server.ts`), which pins each connection to a DNS answer that passed the public-IP check, so a hostname can't rebind to an internal address between check and connect.

---

## Related docs

- [API reference](./API.md) — REST endpoints
- [Data model](./DATA-MODEL.md) — tables and migrations
- [Development](./DEVELOPMENT.md) — env and local workflows
- [Contributing](./CONTRIBUTING.md) — how to change the app safely
