-- Compass: quarterly goals, the habits that serve them, and daily check-ins.
-- Requires 0001_auth.sql.
--
-- A quarter holds goals; a goal holds dated milestones. Habits belong to the
-- user (not the quarter) so ongoing habits — `goal_id` null — carry over for
-- free. A habit's schedule is a dated list: each change starts on the first
-- day of a week, so past weeks keep the target they had. Logs are one row per
-- habit per day; `value` is 1 for a done/not-done habit and the amount for a
-- counted one. Weekly totals, consistency, streaks and passes are all derived
-- from these rows, never stored.

CREATE TABLE IF NOT EXISTS compass_settings (
  user_id text PRIMARY KEY NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  -- IANA name from the browser, e.g. "Europe/London". "Today" is read in it.
  timezone text NOT NULL DEFAULT 'UTC',
  -- 1 = weeks start Monday, 0 = Sunday.
  week_start smallint NOT NULL DEFAULT 1 CHECK (week_start IN (0, 1)),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compass_quarters (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  year integer NOT NULL,
  quarter smallint NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('planning', 'active', 'closed')),
  retro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS compass_quarters_user_idx ON compass_quarters (user_id, year, quarter);

CREATE TABLE IF NOT EXISTS compass_goals (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  quarter_id text NOT NULL REFERENCES compass_quarters (id) ON DELETE CASCADE,
  name text NOT NULL,
  why text,
  color text NOT NULL DEFAULT 'persimmon',
  sort integer NOT NULL DEFAULT 0,
  -- Null while the goal is live; set by the quarter retro or by dropping it.
  outcome text CHECK (outcome IN ('done', 'carried', 'dropped')),
  carried_from_goal_id text REFERENCES compass_goals (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compass_goals_quarter_idx ON compass_goals (quarter_id, sort);

CREATE TABLE IF NOT EXISTS compass_milestones (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  goal_id text NOT NULL REFERENCES compass_goals (id) ON DELETE CASCADE,
  title text NOT NULL,
  due_on date,
  -- S counts 1, M 2, L 3 toward the goal's progress.
  weight text NOT NULL DEFAULT 'M' CHECK (weight IN ('S', 'M', 'L')),
  done_at timestamptz,
  sort integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS compass_milestones_goal_idx ON compass_milestones (goal_id, sort);

CREATE TABLE IF NOT EXISTS compass_habits (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  -- Null = an ongoing habit with no goal.
  goal_id text REFERENCES compass_goals (id) ON DELETE SET NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'check' CHECK (kind IN ('check', 'count')),
  -- Daily amount for a counted habit, e.g. 45 (min) or 8000 (steps).
  target real CHECK (target IS NULL OR target > 0),
  unit text,
  sort integer NOT NULL DEFAULT 0,
  -- The user's local day the habit was made; nothing before it counts.
  created_on date NOT NULL,
  -- Current pause (open-ended) plus finished ones: [{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }].
  paused_on date,
  pauses jsonb NOT NULL DEFAULT '[]'::jsonb,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compass_habits_user_idx ON compass_habits (user_id, sort);

CREATE TABLE IF NOT EXISTS compass_habit_schedules (
  id text PRIMARY KEY NOT NULL,
  habit_id text NOT NULL REFERENCES compass_habits (id) ON DELETE CASCADE,
  -- First day of the week this schedule applies from.
  starts_on date NOT NULL,
  rule text NOT NULL CHECK (rule IN ('daily', 'days', 'per_week')),
  -- For 'days': weekdays, 0 = Monday … 6 = Sunday.
  days jsonb NOT NULL DEFAULT '[]'::jsonb,
  per_week smallint CHECK (per_week IS NULL OR per_week BETWEEN 1 AND 7)
);

CREATE UNIQUE INDEX IF NOT EXISTS compass_habit_schedules_start_idx ON compass_habit_schedules (habit_id, starts_on);

CREATE TABLE IF NOT EXISTS compass_logs (
  habit_id text NOT NULL REFERENCES compass_habits (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  day date NOT NULL,
  value real NOT NULL CHECK (value > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (habit_id, day)
);

CREATE INDEX IF NOT EXISTS compass_logs_user_idx ON compass_logs (user_id, day);

-- Sunday review answers, one row per week (used from the quarter-rhythm release).
CREATE TABLE IF NOT EXISTS compass_reviews (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  quarter_id text NOT NULL REFERENCES compass_quarters (id) ON DELETE CASCADE,
  week_start date NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS compass_reviews_week_idx ON compass_reviews (quarter_id, week_start);
