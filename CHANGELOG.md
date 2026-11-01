# Changelog

All notable changes to KAMI (`quarto`) are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). The browser extension is versioned
separately in `extension/manifest.json`.

## [2.0.0]

### Removed (breaking)

- **Extracts**: the `/extracts` page and `/api/extracts/*` (Firecrawl "ask a page a question").
- **Feeds**: the `/feeds` page, `/api/feeds/*`, the feed sweep hook `/api/hooks/feeds`, and email
  newsletters (`/api/hooks/inbound-email`).
- **Journal**: the `/journal` route and `/api/journal/*`.
- Environment variables `CRON_SECRET`, `INBOUND_EMAIL_DOMAIN` and `INBOUND_EMAIL_SECRET` are no
  longer read.

### Changed

- Vault "Journal Ties" is now "Notes".
- `FIRECRAWL_API_KEY` is documented as being for Trips and Research only.

### Migration

- `0027_drop_extracts.sql` and `0028_drop_feeds_journal.sql` permanently delete the data in
  `extract_*`, `feed*`, `newsletter_inboxes` and `journal_entries`. Back up before running
  `pnpm db:migrate`.

### Kept

- OPML library export/import, article extraction, and the Firecrawl client used by Trips and Research.

## [1.0.0]

Baseline: the app as it was before versioning began (library, reader, shelves, vault, trips,
research, feeds, journal, extracts).
