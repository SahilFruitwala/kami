-- Book covers saved by the Goodreads import pointed at Open Library by ISBN
-- without `default=false`, so a missing cover rendered as a blank 1×1 image
-- instead of the shelf's placeholder. With the flag Open Library returns 404
-- and the UI falls back. Idempotent: only touches URLs without a query.

UPDATE books
SET image_url = image_url || '?default=false'
WHERE image_url LIKE 'https://covers.openlibrary.org/b/isbn/%-M.jpg';
