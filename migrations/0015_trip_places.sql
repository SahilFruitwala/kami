-- Trip map pins and times. Requires 0012_trips.sql.
--
-- Coordinates are optional on itinerary items and hotels: the agent sets them
-- when a source gives them, and "Find on map" geocodes the rest. Items can
-- also carry a start time ("HH:MM", local to the destination) and a duration;
-- without them the slot (morning … night) stands in.

ALTER TABLE trip_items
  ADD COLUMN IF NOT EXISTS lat double precision CHECK (lat BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS lng double precision CHECK (lng BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS start_time text CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD COLUMN IF NOT EXISTS duration_min integer CHECK (duration_min BETWEEN 5 AND 1440);

ALTER TABLE trip_hotels
  ADD COLUMN IF NOT EXISTS lat double precision CHECK (lat BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS lng double precision CHECK (lng BETWEEN -180 AND 180);
