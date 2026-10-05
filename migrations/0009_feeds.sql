-- RSS / Atom / JSON feeds and email newsletters. Requires 0001_auth.sql.
--
-- Feeds are shared: 100 readers of one blog = one row and one poll. Only
-- newsletter "feeds" (kind = 'email') are private, owned by one user.
-- Entries keep lightweight metadata plus the feed-supplied body (raw, capped;
-- sanitized only when an entry is saved into the library), so the feed inbox
-- never triggers page extraction on its own.

CREATE TABLE IF NOT EXISTS feeds (
  id text PRIMARY KEY NOT NULL,
  kind text NOT NULL DEFAULT 'rss' CHECK (kind IN ('rss', 'email')),
  -- Feed document URL (rss) or `email:<owner>:<sender>` (email).
  url text NOT NULL,
  owner_id text REFERENCES "user" ("id") ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  site_url text,
  -- Conditional-GET validators from the last 200 response.
  etag text,
  last_modified text,
  last_fetched_at timestamptz,
  last_new_entry_at timestamptz,
  -- Poll scheduling: adaptive interval, error backoff, and a lease (a claimed
  -- feed's next_fetch_at is pushed forward so parallel pollers skip it).
  next_fetch_at timestamptz NOT NULL DEFAULT now(),
  interval_minutes integer NOT NULL DEFAULT 60 CHECK (interval_minutes > 0),
  error_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS feeds_url_uidx ON feeds (url);
CREATE INDEX IF NOT EXISTS feeds_due_idx ON feeds (next_fetch_at) WHERE kind = 'rss';

CREATE TABLE IF NOT EXISTS feed_subscriptions (
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  feed_id text NOT NULL REFERENCES feeds (id) ON DELETE CASCADE,
  -- Optional user-chosen name; falls back to feeds.title.
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- "Mark all read": entries fetched at or before this are read.
  cleared_at timestamptz,
  PRIMARY KEY (user_id, feed_id)
);

CREATE INDEX IF NOT EXISTS feed_subscriptions_feed_idx ON feed_subscriptions (feed_id);

CREATE TABLE IF NOT EXISTS feed_entries (
  id text PRIMARY KEY NOT NULL,
  feed_id text NOT NULL REFERENCES feeds (id) ON DELETE CASCADE,
  guid text NOT NULL,
  url text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  author text NOT NULL DEFAULT '',
  excerpt text NOT NULL DEFAULT '',
  content_html text NOT NULL DEFAULT '',
  image_url text,
  published_at timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS feed_entries_feed_guid_uidx ON feed_entries (feed_id, guid);
CREATE INDEX IF NOT EXISTS feed_entries_feed_published_idx
  ON feed_entries (feed_id, published_at DESC, id DESC);

-- Per-user read / saved marks (absence = unread unless cleared by cleared_at).
CREATE TABLE IF NOT EXISTS feed_entry_states (
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  entry_id text NOT NULL REFERENCES feed_entries (id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('read', 'saved')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entry_id)
);

-- One private inbound address per user: <token>@INBOUND_EMAIL_DOMAIN.
CREATE TABLE IF NOT EXISTS newsletter_inboxes (
  user_id text PRIMARY KEY NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_inboxes_token_uidx ON newsletter_inboxes (token);
