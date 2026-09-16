-- Daily journal entries (Nisshi). Requires 0001_auth.sql.

CREATE TABLE IF NOT EXISTS journal_entries (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  date text NOT NULL,
  text text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journal_entries_user_id_idx ON journal_entries (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_user_date_uidx ON journal_entries (user_id, date);
