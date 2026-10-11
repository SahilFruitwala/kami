-- AI summaries for saved articles. Requires 0002_library.sql.
--
-- One row per article: the model's TL;DR, key points and organisation
-- suggestions (tags + folder), generated on demand from the reader and kept
-- until the article's text changes. `content_hash` is the sha256 of the
-- article body the summary was made from, so an upgraded copy (link stub →
-- clean text) shows the old summary as stale instead of silently wrong.

CREATE TABLE IF NOT EXISTS article_ai (
  article_id text PRIMARY KEY NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  summary jsonb NOT NULL,
  content_hash text NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS article_ai_user_idx ON article_ai (user_id);
