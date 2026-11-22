-- Links from things you read (books, saved articles, folders) to Compass
-- habits and milestones. A link is always opt-in: no link, nothing happens.
-- Requires 0029_compass.sql.
--
-- `source_id` and `target_id` are polymorphic, so they carry no foreign key;
-- the services remove a link when either end is deleted. `mode` is what
-- happens when the source moves: 'ask' offers it, 'auto' applies it with an
-- undo, 'off' keeps the link without acting on it.

CREATE TABLE IF NOT EXISTS entity_links (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('book', 'article', 'folder')),
  source_id text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('habit', 'milestone')),
  target_id text NOT NULL,
  mode text NOT NULL DEFAULT 'ask' CHECK (mode IN ('ask', 'auto', 'off')),
  -- Optional bar: the day only counts once the amount read reaches this.
  threshold real CHECK (threshold IS NULL OR threshold > 0),
  -- The link acts from this moment on; earlier reading is never back-filled.
  linked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_links_pair_idx
  ON entity_links (user_id, source_type, source_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS entity_links_target_idx ON entity_links (target_type, target_id);

-- What a link added to a habit on a day, kept apart from the habit's own
-- check-ins (`compass_logs`) so a manual tick and an automatic one never fight.
-- `amount` and `unit` are detail ("12 pages"); `counted` is whether that day
-- counts as done for the habit. One row per link per day. `link_id` has no
-- foreign key on purpose: removing a link must not erase the days it already
-- ticked (that would quietly rewrite streaks). Deleting the habit cascades.
CREATE TABLE IF NOT EXISTS compass_log_contributions (
  link_id text NOT NULL,
  habit_id text NOT NULL REFERENCES compass_habits (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  day date NOT NULL,
  amount real NOT NULL CHECK (amount >= 0),
  unit text NOT NULL CHECK (unit IN ('pages', 'percent', 'minutes', 'articles')),
  -- The source's title when it counted, so the day still reads after it is deleted.
  label text,
  counted boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (link_id, day)
);

CREATE INDEX IF NOT EXISTS compass_log_contributions_habit_idx
  ON compass_log_contributions (habit_id, day);
CREATE INDEX IF NOT EXISTS compass_log_contributions_user_idx
  ON compass_log_contributions (user_id, day);
