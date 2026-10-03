-- Cover the library boot/listing query:
--   WHERE user_id = $1 ORDER BY saved_at DESC, id DESC LIMIT $2
-- Previously only `articles_user_id_idx (user_id)` existed, so Postgres had to
-- sort the user's full row set on every boot. The new composite serves both
-- the filter and the ordering; the old single-column index is redundant and
-- is dropped to avoid write amplification. Requires 0002_library.sql.

CREATE INDEX IF NOT EXISTS articles_user_saved_idx
  ON articles (user_id, saved_at DESC, id DESC);

DROP INDEX IF EXISTS articles_user_id_idx;
