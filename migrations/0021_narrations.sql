-- Narrations: an article's full text spoken by Deepgram and stored privately
-- in R2. Requires 0001_auth.sql and 0020_narration_allowance.sql.
-- See src/lib/narration-engine.ts and docs/ARCHITECTURE.md#narration.
--
-- One narration per article. `parts` is the script split into Narration
-- parts; `parts_done` of them are spoken and stored in R2. A run claims the
-- narration with `run_id` + `lease_until` so two runs never overlap.
-- `reserved_chars` was set aside from the allowance when it started;
-- whatever isn't spoken returns when it ends.

CREATE TABLE IF NOT EXISTS narrations (
  id text PRIMARY KEY,
  article_id text NOT NULL UNIQUE REFERENCES articles ("id") ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('queued', 'tidying', 'narrating', 'joining', 'ready', 'paused')),
  paused_reason text,
  model text NOT NULL,
  content_hash text NOT NULL,
  parts jsonb NOT NULL,
  reserved_chars integer NOT NULL,
  parts_done integer NOT NULL DEFAULT 0,
  chars_spoken integer NOT NULL DEFAULT 0,
  tidy_attempted boolean NOT NULL DEFAULT false,
  lease_until timestamptz,
  run_id text,
  audio_key text,
  duration_seconds real,
  bytes integer,
  position_seconds real NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS narrations_user_idx ON narrations (user_id, state);

-- R2 objects that couldn't be deleted when their narration or article went
-- away. Retried opportunistically when narrations are next requested (no
-- cron). Not foreign-keyed: the objects outlive their rows.
CREATE TABLE IF NOT EXISTS r2_orphans (
  key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
