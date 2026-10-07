-- Firecrawl extracts: saved "ask this page a question" sources and their
-- Markdown results. Requires 0001_auth.sql.
--
-- A source is private to one user (URL + question). Running it calls
-- Firecrawl's /v2/scrape `question` format and stores the answer as a
-- `pending` result the user reviews: Accept keeps it (`accepted`), Discard
-- deletes it. At most one pending result per source — a re-run replaces it.

CREATE TABLE IF NOT EXISTS extract_sources (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  question text NOT NULL,
  last_run_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS extract_sources_user_idx ON extract_sources (user_id, created_at);

CREATE TABLE IF NOT EXISTS extract_results (
  id text PRIMARY KEY NOT NULL,
  source_id text NOT NULL REFERENCES extract_sources (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  -- Firecrawl's answer, as returned (Markdown). Rendered + sanitized on read.
  markdown text NOT NULL,
  -- Snapshot of what was asked, so history survives edits to the source.
  url text NOT NULL,
  question text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS extract_results_one_pending_uidx
  ON extract_results (source_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS extract_results_source_idx
  ON extract_results (source_id, created_at DESC);
