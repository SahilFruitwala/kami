-- Series and books gain an "in_progress" status (watching / reading).
-- Widen the status CHECK from 0003 (to_try/done/abandoned only). Constraints
-- are found by definition, not name, so a database whose constraint was
-- named differently can't keep the old rule alongside the new one.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conrelid::regclass AS tbl, conname
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN ('tv_shows'::regclass, 'books'::regclass)
      AND pg_get_constraintdef(oid) LIKE '%status%'
      AND pg_get_constraintdef(oid) LIKE '%to_try%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;

ALTER TABLE tv_shows ADD CONSTRAINT tv_shows_status_check
  CHECK (status IN ('to_try','in_progress','done','abandoned'));
ALTER TABLE books ADD CONSTRAINT books_status_check
  CHECK (status IN ('to_try','in_progress','done','abandoned'));

-- Repair show progress from the ticks themselves: before this migration a
-- rejected status write also dropped the episode counter update.
UPDATE tv_shows t
SET episodes_watched = p.n,
    last_episode = 'S' || p.season || 'E' || p.number
FROM (
  SELECT DISTINCT ON (item_id)
    item_id,
    count(*) OVER (PARTITION BY item_id) AS n,
    season,
    number
  FROM watched_episodes
  ORDER BY item_id, season DESC, number DESC
) p
WHERE p.item_id = t.id;

-- Status follows the ticks (same rules as syncShowProgress).
UPDATE tv_shows
SET status = 'done', completed_at = coalesce(completed_at, now())
WHERE status = 'to_try'
  AND total_episodes IS NOT NULL
  AND episodes_watched >= total_episodes
  AND episodes_watched > 0;

UPDATE tv_shows
SET status = 'in_progress'
WHERE status = 'to_try'
  AND episodes_watched > 0;
