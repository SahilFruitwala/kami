-- Trip status: where a trip stands, set by hand. Requires 0012_trips.sql.
--
-- A plain label ('planning', 'booked', 'done', 'archived'); it gates nothing
-- and never changes on its own. Existing trips start as 'planning'.

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'planning'
  CHECK (status IN ('planning', 'booked', 'done', 'archived'));
