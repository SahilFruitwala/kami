-- Narration allowance: a per-user ledger of characters the user may have
-- narrated. Requires 0001_auth.sql. See src/lib/allowance.ts.
--
-- kind: grant (+, the operator adds allowance), reserve (−, a narration sets
-- aside its script), release (+, an unfinished narration's unspoken part
-- returns). The sum of `chars` is what is available. Every user starts with
-- no rows, so with nothing to spend. `narration_id` is deliberately not a
-- foreign key: the history outlives deleted narrations.

CREATE TABLE IF NOT EXISTS allowance_entries (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('grant', 'reserve', 'release')),
  chars integer NOT NULL,
  note text NOT NULL DEFAULT '',
  narration_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS allowance_entries_user_idx ON allowance_entries (user_id, created_at DESC);
