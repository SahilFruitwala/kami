-- Prevent duplicate movies / TV shows on the same list.
-- Prefer TMDB id when present; otherwise one row per normalized title.
-- Deduplicate existing rows (keep oldest) before creating unique indexes.

-- Movies: collapse same TMDB id on a list
DELETE FROM movies a
WHERE a.tmdb_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM movies b
    WHERE b.list_id = a.list_id
      AND b.tmdb_id = a.tmdb_id
      AND (
        b.created_at < a.created_at
        OR (b.created_at = a.created_at AND b.id < a.id)
      )
  );

-- Movies: collapse same normalized title on a list
DELETE FROM movies a
WHERE a.normalized_title IS NOT NULL
  AND a.normalized_title <> ''
  AND EXISTS (
    SELECT 1 FROM movies b
    WHERE b.list_id = a.list_id
      AND b.normalized_title = a.normalized_title
      AND (
        b.created_at < a.created_at
        OR (b.created_at = a.created_at AND b.id < a.id)
      )
  );

-- TV: collapse same TMDB id on a list
DELETE FROM tv_shows a
WHERE a.tmdb_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM tv_shows b
    WHERE b.list_id = a.list_id
      AND b.tmdb_id = a.tmdb_id
      AND (
        b.created_at < a.created_at
        OR (b.created_at = a.created_at AND b.id < a.id)
      )
  );

-- TV: collapse same normalized title on a list
DELETE FROM tv_shows a
WHERE a.normalized_title IS NOT NULL
  AND a.normalized_title <> ''
  AND EXISTS (
    SELECT 1 FROM tv_shows b
    WHERE b.list_id = a.list_id
      AND b.normalized_title = a.normalized_title
      AND (
        b.created_at < a.created_at
        OR (b.created_at = a.created_at AND b.id < a.id)
      )
  );

CREATE UNIQUE INDEX IF NOT EXISTS movies_list_tmdb_uidx
  ON movies (list_id, tmdb_id)
  WHERE tmdb_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS movies_list_normalized_title_uidx
  ON movies (list_id, normalized_title)
  WHERE normalized_title IS NOT NULL AND normalized_title <> '';

CREATE UNIQUE INDEX IF NOT EXISTS tv_shows_list_tmdb_uidx
  ON tv_shows (list_id, tmdb_id)
  WHERE tmdb_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tv_shows_list_normalized_title_uidx
  ON tv_shows (list_id, normalized_title)
  WHERE normalized_title IS NOT NULL AND normalized_title <> '';
