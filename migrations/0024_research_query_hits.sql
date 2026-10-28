-- Research: keep each search's results with the query that found them.
-- Requires 0023_research.sql.
--
-- `hits` is the search result list ({ url, title, description }[]) as
-- Firecrawl returned it. Triage reads it, so a resumed run never searches
-- (and pays) again for a query it already sent.

ALTER TABLE research_queries
  ADD COLUMN IF NOT EXISTS hits jsonb NOT NULL DEFAULT '[]'::jsonb;
