-- One undo point per trip for the trip agent. Requires 0012_trips.sql.
--
-- Before the agent's first write in a chat turn, the whole trip (details,
-- hotels, itinerary) is saved here, replacing any earlier snapshot. "Undo"
-- restores it and deletes the row, so only the latest agent turn can be undone.

CREATE TABLE IF NOT EXISTS trip_snapshots (
  trip_id text PRIMARY KEY NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
