-- Research: Topics, runs, sources, evidence and ideas, plus the research
-- credit ledger. Requires 0001_auth.sql. See docs/wayfinder/research/spec.md
-- and src/lib/research/kinds.ts (the CHECK lists below mirror it).
--
-- Every row is private to its user. Sources are a per-user page cache shared
-- by that user's topics (never across users). Evidence is an exact quote
-- that code has checked against its source; ideas group pain, request and
-- workaround evidence and carry a score computed in code.

-- Research credit ledger: same rules as allowance_entries (0020). kind:
-- grant (+, the operator adds credits), reserve (−, a run sets its budget
-- aside), release (+, the unspent part returns when the run ends). The sum
-- of `credits` is what is available; everyone starts with no rows. `run_id`
-- is deliberately not a foreign key: the history outlives deleted runs.
CREATE TABLE IF NOT EXISTS research_credit_entries (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('grant', 'reserve', 'release')),
  credits integer NOT NULL,
  note text NOT NULL DEFAULT '',
  run_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_credit_entries_user_idx
  ON research_credit_entries (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS research_topics (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_topics_user_idx ON research_topics (user_id, updated_at DESC);

-- One execution inside a topic. Steps save their output before the next
-- starts, so a later invocation resumes at `step`; `run_lease` + `lease_until`
-- keep two invocations off the same run (as in narrations). Spend is counted
-- as it happens; `charged_credits` is settled when the run ends.
CREATE TABLE IF NOT EXISTS research_runs (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  topic_id text NOT NULL REFERENCES research_topics (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('discover', 'validate', 'question', 'explore')),
  state text NOT NULL CHECK (
    state IN ('drafting', 'awaiting_plan', 'queued', 'running', 'done', 'stopped', 'failed')
  ),
  stop_reason text CHECK (stop_reason IN ('budget', 'user', 'error')),
  depth text NOT NULL CHECK (depth IN ('quick', 'deep')),
  input jsonb NOT NULL,
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  step text,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  budget_credits integer NOT NULL DEFAULT 0,
  firecrawl_credits integer NOT NULL DEFAULT 0,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  charged_credits integer,
  error text,
  run_lease text,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS research_runs_topic_idx ON research_runs (topic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS research_runs_user_state_idx ON research_runs (user_id, state);

-- Every query a run actually sent, so later plans can flag repeats.
CREATE TABLE IF NOT EXISTS research_queries (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  topic_id text NOT NULL REFERENCES research_topics (id) ON DELETE CASCADE,
  run_id text NOT NULL REFERENCES research_runs (id) ON DELETE CASCADE,
  query_norm text NOT NULL,
  results integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_queries_topic_idx ON research_queries (topic_id, query_norm);
CREATE INDEX IF NOT EXISTS research_queries_run_idx ON research_queries (run_id);

-- The per-user page cache. `url_key` is the normalised URL (one row per page
-- per user); `kind` decides how long the copy stays fresh.
CREATE TABLE IF NOT EXISTS research_sources (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  url text NOT NULL,
  url_key text NOT NULL,
  site text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('thread', 'review', 'pricing', 'homepage', 'article', 'other')),
  title text NOT NULL DEFAULT '',
  markdown text NOT NULL,
  content_hash text NOT NULL,
  published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  added_by text NOT NULL CHECK (added_by IN ('search', 'link'))
);

CREATE UNIQUE INDEX IF NOT EXISTS research_sources_user_url_idx ON research_sources (user_id, url_key);

-- Which cached sources a topic has used. Deleting a topic leaves the cache.
CREATE TABLE IF NOT EXISTS research_topic_sources (
  topic_id text NOT NULL REFERENCES research_topics (id) ON DELETE CASCADE,
  source_id text NOT NULL REFERENCES research_sources (id) ON DELETE CASCADE,
  first_run_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (topic_id, source_id)
);

CREATE INDEX IF NOT EXISTS research_topic_sources_source_idx ON research_topic_sources (source_id);

-- One checked quote. `author_key` is a hash of site + handle; the handle
-- itself is never stored. The unique index keeps re-reads from duplicating.
CREATE TABLE IF NOT EXISTS research_evidence (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  topic_id text NOT NULL REFERENCES research_topics (id) ON DELETE CASCADE,
  source_id text NOT NULL REFERENCES research_sources (id) ON DELETE CASCADE,
  run_id text REFERENCES research_runs (id) ON DELETE SET NULL,
  quote text NOT NULL,
  kind text NOT NULL CHECK (
    kind IN ('pain', 'request', 'workaround', 'price', 'competitor', 'stat', 'opinion')
  ),
  sentiment smallint NOT NULL DEFAULT 0 CHECK (sentiment BETWEEN -2 AND 2),
  strong boolean NOT NULL DEFAULT false,
  pays boolean NOT NULL DEFAULT false,
  names text[] NOT NULL DEFAULT '{}',
  author_key text,
  posted_at timestamptz,
  match text NOT NULL CHECK (match IN ('exact', 'close')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS research_evidence_quote_idx
  ON research_evidence (topic_id, source_id, md5(quote));
CREATE INDEX IF NOT EXISTS research_evidence_topic_idx ON research_evidence (topic_id, kind);
CREATE INDEX IF NOT EXISTS research_evidence_run_idx ON research_evidence (run_id);

-- A product opportunity in a topic. `score` holds the sub-scores;
-- `score_total` is copied out of it for sorting. A user rename sets
-- `named_by = 'user'` and runs never rename it again.
CREATE TABLE IF NOT EXISTS research_ideas (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  topic_id text NOT NULL REFERENCES research_topics (id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'starred', 'dismissed', 'merged')),
  merged_into text REFERENCES research_ideas (id) ON DELETE SET NULL,
  named_by text NOT NULL DEFAULT 'model' CHECK (named_by IN ('model', 'user')),
  score jsonb,
  score_total real NOT NULL DEFAULT 0,
  evidence_count integer NOT NULL DEFAULT 0,
  first_run_id text,
  last_run_id text,
  added_last_run integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_ideas_topic_idx
  ON research_ideas (topic_id, status, score_total DESC);

-- Evidence behind an idea. A quote belongs to at most one idea at a time;
-- merging moves the rows to the surviving idea.
CREATE TABLE IF NOT EXISTS research_idea_evidence (
  idea_id text NOT NULL REFERENCES research_ideas (id) ON DELETE CASCADE,
  evidence_id text NOT NULL REFERENCES research_evidence (id) ON DELETE CASCADE,
  run_id text,
  PRIMARY KEY (idea_id, evidence_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS research_idea_evidence_evidence_idx
  ON research_idea_evidence (evidence_id);

-- Model answers by sha256(model id + prompt version + input). A hit costs
-- nothing; rows older than 30 days are pruned when runs finish. Not per user:
-- the key is derived from the full input, so a hit only ever returns the
-- answer to the same input.
CREATE TABLE IF NOT EXISTS research_model_cache (
  key text PRIMARY KEY,
  model text NOT NULL,
  output jsonb NOT NULL,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_model_cache_created_idx ON research_model_cache (created_at);
