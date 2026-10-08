-- Trips: a private trip plan per user — details, a hotel shortlist, and a
-- day-by-day itinerary. Requires 0001_auth.sql.
--
-- The trip stores a start date and a day count; the end date is derived, so
-- the two can never disagree. Itinerary items point at a 0-based day index
-- inside that range and a time-of-day slot. At most one hotel per trip is
-- `chosen` (partial unique index); the rest are `shortlisted`.

CREATE TABLE IF NOT EXISTS trips (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  title text NOT NULL,
  destination text NOT NULL,
  start_date date,
  day_count integer NOT NULL DEFAULT 3 CHECK (day_count BETWEEN 1 AND 30),
  travelers integer CHECK (travelers BETWEEN 1 AND 20),
  budget text,
  preferences text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trips_user_idx ON trips (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS trip_hotels (
  id text PRIMARY KEY NOT NULL,
  trip_id text NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  name text NOT NULL,
  area text,
  url text,
  -- Free text such as "≈ €140/night (seen on a booking site)" — never live pricing.
  price_note text,
  rating_note text,
  why text,
  status text NOT NULL DEFAULT 'shortlisted' CHECK (status IN ('shortlisted', 'chosen')),
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_hotels_trip_idx ON trip_hotels (trip_id, sort);
CREATE UNIQUE INDEX IF NOT EXISTS trip_hotels_one_chosen_uidx
  ON trip_hotels (trip_id) WHERE status = 'chosen';

CREATE TABLE IF NOT EXISTS trip_items (
  id text PRIMARY KEY NOT NULL,
  trip_id text NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  day_index integer NOT NULL CHECK (day_index BETWEEN 0 AND 29),
  slot text NOT NULL CHECK (slot IN ('morning', 'afternoon', 'evening', 'night')),
  title text NOT NULL,
  place text,
  url text,
  notes text,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_items_trip_idx ON trip_items (trip_id, day_index, sort);
