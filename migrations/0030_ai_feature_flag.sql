-- Per-user gate for library AI, the trip agent, and Research.
-- Everyone starts off; the operator turns a user on with `pnpm ai:grant`.
ALTER TABLE user_feature_flags
  ADD COLUMN IF NOT EXISTS ai boolean NOT NULL DEFAULT false;
