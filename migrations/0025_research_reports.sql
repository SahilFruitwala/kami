-- Research: cited reports from Validate (and later, questions).
-- Requires 0023_research.sql. body is sections of claims
-- ({ text, evidenceIds[], unsupported? }); code checks every evidence id
-- against the topic before the report is stored.

CREATE TABLE IF NOT EXISTS research_reports (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  topic_id text NOT NULL REFERENCES research_topics (id) ON DELETE CASCADE,
  run_id text NOT NULL REFERENCES research_runs (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('validate', 'question')),
  idea_id text REFERENCES research_ideas (id) ON DELETE SET NULL,
  question text NOT NULL DEFAULT '',
  body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id)
);

CREATE INDEX IF NOT EXISTS research_reports_topic_idx
  ON research_reports (topic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS research_reports_user_idx
  ON research_reports (user_id, created_at DESC);
