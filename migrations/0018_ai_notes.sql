-- Generated AI write-ups that aren't tied to one article: the weekly reading
-- recap, feed digests. Requires 0001_auth.sql.
--
-- One row per (user, kind, key): `kind` names the feature ('weekly-recap',
-- 'feed-digest'), `key` the period or scope it covers (e.g. the date it was
-- made). `content` is the feature's own JSON shape; regenerating replaces it.

CREATE TABLE IF NOT EXISTS ai_notes (
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  kind text NOT NULL,
  key text NOT NULL,
  content jsonb NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, key)
);

CREATE INDEX IF NOT EXISTS ai_notes_recent_idx ON ai_notes (user_id, kind, created_at DESC);
