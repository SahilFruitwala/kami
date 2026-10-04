-- Reading progress for books: a percent that is always set, plus optional
-- page numbers it is derived from when the reader tracks by page.
ALTER TABLE books ADD COLUMN IF NOT EXISTS current_page integer CHECK (current_page >= 0);
ALTER TABLE books ADD COLUMN IF NOT EXISTS page_count integer CHECK (page_count > 0);
ALTER TABLE books ADD COLUMN IF NOT EXISTS progress_percent integer NOT NULL DEFAULT 0
  CHECK (progress_percent BETWEEN 0 AND 100);

UPDATE books SET progress_percent = 100 WHERE status = 'done';
