-- Trip agent chat history. Requires 0012_trips.sql.
--
-- One row per chat message, stored in the AI SDK's UIMessage shape (`parts`
-- jsonb: text, tool calls and their results) so a reload shows the same
-- conversation. `seq` gives a stable order even when two rows share a
-- timestamp. `model` records which model wrote an assistant message.

CREATE TABLE IF NOT EXISTS trip_messages (
  id text PRIMARY KEY NOT NULL,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  trip_id text NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  parts jsonb NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_messages_trip_idx ON trip_messages (trip_id, seq);
