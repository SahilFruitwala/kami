-- Per-user Quarto library (articles, folders). Requires 0001_auth.sql.

CREATE TABLE IF NOT EXISTS folders (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS folders_user_id_idx ON folders (user_id);

CREATE TABLE IF NOT EXISTS articles (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  url text NOT NULL,
  canonical_url text NOT NULL,
  title text NOT NULL,
  author text NOT NULL DEFAULT '',
  site_name text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'blog',
  word_count integer NOT NULL DEFAULT 0,
  reading_minutes integer NOT NULL DEFAULT 1,
  excerpt text NOT NULL DEFAULT '',
  content_html text NOT NULL DEFAULT '',
  hero_image text,
  published text,
  saved_at timestamptz NOT NULL DEFAULT now(),
  archived boolean NOT NULL DEFAULT false,
  favorited boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '',
  folder_id text REFERENCES folders (id) ON DELETE SET NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS articles_user_id_idx ON articles (user_id);
CREATE INDEX IF NOT EXISTS articles_user_archived_idx ON articles (user_id, archived);
CREATE UNIQUE INDEX IF NOT EXISTS articles_user_canonical_uidx ON articles (user_id, canonical_url);
