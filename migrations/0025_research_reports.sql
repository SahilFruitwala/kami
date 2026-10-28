-- Research reports: the cited write-up a Validate or question run produces.
-- Requires 0023_research.sql.
--
-- `body` holds sections of claims, each claim `{ text, evidenceIds[], unsupported?, note? }`.
-- Code checks every evidence id against the topic before a report is stored,
-- so a claim with no real evidence is kept but marked unsupported.

CREATE TABLE IF NOT EXISTS research_reports (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  topic_id text NOT NULL REFERENCES research_topics (id) ON DELETE CASCADE,
  run_id text NOT NULL REFERENCES research_runs (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('validate', 'question')),
  idea_id text REFERENCES research_ideas (id) ON DELETE SET NULL,
  question text NOT NULL,
  body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS research_reports_run_idx ON research_reports (run_id);
CREATE INDEX IF NOT EXISTS research_reports_topic_idx ON research_reports (topic_id, created_at DESC);
