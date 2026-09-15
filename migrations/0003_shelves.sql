-- Shelf tables (TV / Movies / Books / Places / Restaurants / Wishlist).
-- Port of the SQLite drizzle schema to Postgres. Requires 0001_auth.sql.
-- Snake_case columns match the source app to keep the import 1:1.
-- Simple-pocket's own tables (folders/articles) are untouched.

-- User extensions (GDPR soft-delete). Base "user" table comes from 0001_auth.sql.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_feature_flags (
  user_id text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  sharing boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start integer NOT NULL
);

CREATE TABLE IF NOT EXISTS lists (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('restaurant','movie','tv','book','place','wishlist','mixed','trip')),
  owner_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  join_code text UNIQUE,
  view_code text UNIQUE,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lists_owner_idx ON lists (owner_id);

CREATE TABLE IF NOT EXISTS list_members (
  id text PRIMARY KEY,
  list_id text NOT NULL REFERENCES lists ("id") ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('owner','editor')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS list_members_list_idx ON list_members (list_id);
CREATE INDEX IF NOT EXISTS list_members_user_idx ON list_members (user_id);

-- ---------- Item tables ----------

CREATE TABLE IF NOT EXISTS restaurants (
  id text PRIMARY KEY,
  list_id text NOT NULL REFERENCES lists ("id") ON DELETE CASCADE,
  title text NOT NULL,
  normalized_title text,
  notes text,
  link text,
  image_url text,
  status text NOT NULL DEFAULT 'to_try' CHECK (status IN ('to_try','done','abandoned')),
  group_name text,
  extra_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  added_by text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cuisine text,
  address text,
  price text,
  rating text,
  kind text,
  latitude text,
  longitude text
);
CREATE INDEX IF NOT EXISTS restaurants_list_idx ON restaurants (list_id);
CREATE INDEX IF NOT EXISTS restaurants_list_normalized_title_idx ON restaurants (list_id, normalized_title);
CREATE INDEX IF NOT EXISTS restaurants_list_status_created_idx ON restaurants (list_id, status, created_at, id);
CREATE INDEX IF NOT EXISTS restaurants_list_status_title_idx ON restaurants (list_id, status, (lower(title)), id);
CREATE INDEX IF NOT EXISTS restaurants_list_cuisine_idx ON restaurants (list_id, cuisine);

CREATE TABLE IF NOT EXISTS movies (
  id text PRIMARY KEY,
  list_id text NOT NULL REFERENCES lists ("id") ON DELETE CASCADE,
  title text NOT NULL,
  normalized_title text,
  notes text,
  link text,
  image_url text,
  status text NOT NULL DEFAULT 'to_try' CHECK (status IN ('to_try','done','abandoned')),
  group_name text,
  extra_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  added_by text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  release_year integer,
  overview text,
  tmdb_id integer
);
CREATE INDEX IF NOT EXISTS movies_list_idx ON movies (list_id);
CREATE INDEX IF NOT EXISTS movies_list_normalized_title_idx ON movies (list_id, normalized_title);
CREATE INDEX IF NOT EXISTS movies_list_status_created_idx ON movies (list_id, status, created_at, id);
CREATE INDEX IF NOT EXISTS movies_list_status_title_idx ON movies (list_id, status, (lower(title)), id);

CREATE TABLE IF NOT EXISTS tv_shows (
  id text PRIMARY KEY,
  list_id text NOT NULL REFERENCES lists ("id") ON DELETE CASCADE,
  title text NOT NULL,
  normalized_title text,
  notes text,
  link text,
  image_url text,
  status text NOT NULL DEFAULT 'to_try' CHECK (status IN ('to_try','done','abandoned')),
  group_name text,
  extra_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  added_by text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  release_year integer,
  overview text,
  tmdb_id integer,
  episodes_watched integer NOT NULL DEFAULT 0,
  last_episode text,
  total_episodes integer
);
CREATE INDEX IF NOT EXISTS tv_shows_list_idx ON tv_shows (list_id);
CREATE INDEX IF NOT EXISTS tv_shows_list_normalized_title_idx ON tv_shows (list_id, normalized_title);
CREATE INDEX IF NOT EXISTS tv_shows_list_status_created_idx ON tv_shows (list_id, status, created_at, id);
CREATE INDEX IF NOT EXISTS tv_shows_list_status_title_idx ON tv_shows (list_id, status, (lower(title)), id);

CREATE TABLE IF NOT EXISTS books (
  id text PRIMARY KEY,
  list_id text NOT NULL REFERENCES lists ("id") ON DELETE CASCADE,
  title text NOT NULL,
  normalized_title text,
  notes text,
  link text,
  image_url text,
  status text NOT NULL DEFAULT 'to_try' CHECK (status IN ('to_try','done','abandoned')),
  group_name text,
  extra_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  added_by text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  author text,
  publish_year integer,
  overview text
);
CREATE INDEX IF NOT EXISTS books_list_idx ON books (list_id);
CREATE INDEX IF NOT EXISTS books_list_normalized_title_idx ON books (list_id, normalized_title);
CREATE INDEX IF NOT EXISTS books_list_status_created_idx ON books (list_id, status, created_at, id);
CREATE INDEX IF NOT EXISTS books_list_status_title_idx ON books (list_id, status, (lower(title)), id);
CREATE INDEX IF NOT EXISTS books_list_author_idx ON books (list_id, author);

CREATE TABLE IF NOT EXISTS places (
  id text PRIMARY KEY,
  list_id text NOT NULL REFERENCES lists ("id") ON DELETE CASCADE,
  title text NOT NULL,
  normalized_title text,
  notes text,
  link text,
  image_url text,
  status text NOT NULL DEFAULT 'to_try' CHECK (status IN ('to_try','done','abandoned')),
  group_name text,
  extra_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  added_by text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  address text,
  rating text,
  price text,
  kind text,
  latitude text,
  longitude text
);
CREATE INDEX IF NOT EXISTS places_list_idx ON places (list_id);
CREATE INDEX IF NOT EXISTS places_list_normalized_title_idx ON places (list_id, normalized_title);
CREATE INDEX IF NOT EXISTS places_list_status_created_idx ON places (list_id, status, created_at, id);
CREATE INDEX IF NOT EXISTS places_list_status_title_idx ON places (list_id, status, (lower(title)), id);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id text PRIMARY KEY,
  list_id text NOT NULL REFERENCES lists ("id") ON DELETE CASCADE,
  title text NOT NULL,
  normalized_title text,
  notes text,
  link text,
  image_url text,
  status text NOT NULL DEFAULT 'to_try' CHECK (status IN ('to_try','done','abandoned')),
  group_name text,
  extra_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  added_by text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  price text,
  description text,
  source text
);
CREATE INDEX IF NOT EXISTS wishlist_items_list_idx ON wishlist_items (list_id);
CREATE INDEX IF NOT EXISTS wishlist_items_list_normalized_title_idx ON wishlist_items (list_id, normalized_title);
CREATE INDEX IF NOT EXISTS wishlist_items_list_status_created_idx ON wishlist_items (list_id, status, created_at, id);
CREATE INDEX IF NOT EXISTS wishlist_items_list_status_title_idx ON wishlist_items (list_id, status, (lower(title)), id);

-- ---------- Genres ----------

CREATE TABLE IF NOT EXISTS genres (
  id text PRIMARY KEY,
  name text NOT NULL,
  normalized_name text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS movie_genres (
  movie_id text NOT NULL REFERENCES movies ("id") ON DELETE CASCADE,
  genre_id text NOT NULL REFERENCES genres ("id") ON DELETE CASCADE,
  UNIQUE (movie_id, genre_id)
);
CREATE INDEX IF NOT EXISTS movie_genres_genre_movie_idx ON movie_genres (genre_id, movie_id);

CREATE TABLE IF NOT EXISTS tv_show_genres (
  tv_show_id text NOT NULL REFERENCES tv_shows ("id") ON DELETE CASCADE,
  genre_id text NOT NULL REFERENCES genres ("id") ON DELETE CASCADE,
  UNIQUE (tv_show_id, genre_id)
);
CREATE INDEX IF NOT EXISTS tv_show_genres_genre_show_idx ON tv_show_genres (genre_id, tv_show_id);

CREATE TABLE IF NOT EXISTS book_genres (
  book_id text NOT NULL REFERENCES books ("id") ON DELETE CASCADE,
  genre_id text NOT NULL REFERENCES genres ("id") ON DELETE CASCADE,
  UNIQUE (book_id, genre_id)
);
CREATE INDEX IF NOT EXISTS book_genres_genre_book_idx ON book_genres (genre_id, book_id);

-- ---------- Activity / reactions / episodes ----------

CREATE TABLE IF NOT EXISTS activity (
  id text PRIMARY KEY,
  list_id text NOT NULL REFERENCES lists ("id") ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('added','completed','abandoned','reverted','removed','joined')),
  item_title text,
  item_type text CHECK (item_type IN ('restaurant','movie','tv','book','place','wishlist')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_list_idx ON activity (list_id);

CREATE TABLE IF NOT EXISTS item_reactions (
  id text PRIMARY KEY,
  item_id text NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('restaurant','movie','tv','book','place','wishlist')),
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, user_id)
);
CREATE INDEX IF NOT EXISTS item_reactions_item_idx ON item_reactions (item_type, item_id);

CREATE TABLE IF NOT EXISTS watched_episodes (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES tv_shows ("id") ON DELETE CASCADE,
  season integer NOT NULL,
  number integer NOT NULL,
  watched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, season, number)
);
CREATE INDEX IF NOT EXISTS watched_episodes_item_idx ON watched_episodes (item_id);

-- Polymorphic cascade for reactions (SQLite used triggers; FK can't express it).
CREATE OR REPLACE FUNCTION delete_item_reactions() RETURNS trigger AS $$
BEGIN
  DELETE FROM item_reactions WHERE item_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS restaurants_reactions_cleanup ON restaurants;
CREATE TRIGGER restaurants_reactions_cleanup AFTER DELETE ON restaurants
  FOR EACH ROW EXECUTE FUNCTION delete_item_reactions();
DROP TRIGGER IF EXISTS movies_reactions_cleanup ON movies;
CREATE TRIGGER movies_reactions_cleanup AFTER DELETE ON movies
  FOR EACH ROW EXECUTE FUNCTION delete_item_reactions();
DROP TRIGGER IF EXISTS tv_shows_reactions_cleanup ON tv_shows;
CREATE TRIGGER tv_shows_reactions_cleanup AFTER DELETE ON tv_shows
  FOR EACH ROW EXECUTE FUNCTION delete_item_reactions();
DROP TRIGGER IF EXISTS books_reactions_cleanup ON books;
CREATE TRIGGER books_reactions_cleanup AFTER DELETE ON books
  FOR EACH ROW EXECUTE FUNCTION delete_item_reactions();
DROP TRIGGER IF EXISTS places_reactions_cleanup ON places;
CREATE TRIGGER places_reactions_cleanup AFTER DELETE ON places
  FOR EACH ROW EXECUTE FUNCTION delete_item_reactions();
DROP TRIGGER IF EXISTS wishlist_items_reactions_cleanup ON wishlist_items;
CREATE TRIGGER wishlist_items_reactions_cleanup AFTER DELETE ON wishlist_items
  FOR EACH ROW EXECUTE FUNCTION delete_item_reactions();

-- Read-only compatibility projection over the six item tables.
CREATE OR REPLACE VIEW items AS
  SELECT id, list_id, 'restaurant'::text AS type, title, normalized_title, notes, link, image_url, status,
    extra_metadata AS metadata, added_by, created_at, completed_at,
    NULL::text AS genre, NULL::text AS author, address
  FROM restaurants
  UNION ALL
  SELECT id, list_id, 'movie'::text, title, normalized_title, notes, link, image_url, status,
    extra_metadata, added_by, created_at, completed_at,
    NULL::text, NULL::text, NULL::text
  FROM movies
  UNION ALL
  SELECT id, list_id, 'tv'::text, title, normalized_title, notes, link, image_url, status,
    extra_metadata, added_by, created_at, completed_at,
    NULL::text, NULL::text, NULL::text
  FROM tv_shows
  UNION ALL
  SELECT id, list_id, 'book'::text, title, normalized_title, notes, link, image_url, status,
    extra_metadata, added_by, created_at, completed_at,
    NULL::text, author, NULL::text
  FROM books
  UNION ALL
  SELECT id, list_id, 'place'::text, title, normalized_title, notes, link, image_url, status,
    extra_metadata, added_by, created_at, completed_at,
    NULL::text, NULL::text, address
  FROM places
  UNION ALL
  SELECT id, list_id, 'wishlist'::text, title, normalized_title, notes, link, image_url, status,
    extra_metadata, added_by, created_at, completed_at,
    NULL::text, NULL::text, NULL::text
  FROM wishlist_items;
