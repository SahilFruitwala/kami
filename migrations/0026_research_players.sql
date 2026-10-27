-- Research players: the products already in a topic's space (Explore).
-- Requires 0023_research.sql.
--
-- A player is created from a name in evidence (or an Explore run) and keyed
-- by `name_key`, so spellings of one product share a row. `filled_at` is set
-- once its homepage and pricing page have been looked at (or no site was
-- found), so a player is never filled twice. `source_ids` are the stored
-- pages its fields came from.

CREATE TABLE IF NOT EXISTS research_players (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  topic_id text NOT NULL REFERENCES research_topics (id) ON DELETE CASCADE,
  name text NOT NULL,
  name_key text NOT NULL,
  url text,
  category text,
  one_liner text,
  audience text CHECK (audience IN ('b2b', 'b2c', 'both')),
  pricing jsonb,
  free_plan boolean,
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  filled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS research_players_key_idx ON research_players (topic_id, name_key);

-- Evidence that names a player. A quote can name several.
CREATE TABLE IF NOT EXISTS research_player_evidence (
  player_id text NOT NULL REFERENCES research_players (id) ON DELETE CASCADE,
  evidence_id text NOT NULL REFERENCES research_evidence (id) ON DELETE CASCADE,
  PRIMARY KEY (player_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS research_player_evidence_evidence_idx
  ON research_player_evidence (evidence_id);
