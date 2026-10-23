-- Auto-tidy: every article records where it is in the Tidy lifecycle, and
-- keeps its Original copy (the body before Tidy changed it) so the reader can
-- restore it. Requires 0001_auth.sql.
--
-- tidy_state: pending | tidied | skipped | failed | restored (see
-- src/lib/tidy-state.ts). Existing articles start as pending and are tidied
-- the first time they are opened.

ALTER TABLE articles ADD COLUMN IF NOT EXISTS tidy_state text NOT NULL DEFAULT 'pending';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS original_html text;
