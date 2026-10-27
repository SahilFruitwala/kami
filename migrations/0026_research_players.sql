-- Research: Players in a topic (Explore). Created from evidence `names`
-- and from kind = explore runs. name_key is the dedupe key; homepage and
-- pricing pages (source_ids) are the only input a worker may use to fill
-- one_liner, category, audience, pricing and free_plan.

CREATE TABLE IF NOT EXISTS research_players (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  topic_id text NOT NULL REFERENCES research_topics (id) ON DELETE CASCADE,
  name text NOT NULL,
  name_key text NOT NULL,
  url text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  one_liner text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT '',
  pricing jsonb NOT NULL DEFAULT '{"plans":[]}'::jsonb,
  free_plan boolean NOT NULL DEFAULT false,
  source_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topic_id, name_key)
);

CREATE INDEX IF NOT EXISTS research_players_topic_idx
  ON research_players (topic_id, category, name);

CREATE INDEX IF NOT EXISTS research_players_user_idx
  ON research_players (user_id);

CREATE TABLE IF NOT EXISTS research_player_evidence (
  player_id text NOT NULL REFERENCES research_players (id) ON DELETE CASCADE,
  evidence_id text NOT NULL REFERENCES research_evidence (id) ON DELETE CASCADE,
  PRIMARY KEY (player_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS research_player_evidence_evidence_idx
  ON research_player_evidence (evidence_id);
