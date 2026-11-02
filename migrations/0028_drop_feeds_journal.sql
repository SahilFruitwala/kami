-- The Feeds (RSS + newsletter) and Journal features were removed.
-- See 0005_journal.sql and 0009_feeds.sql for the original definitions.

DROP TABLE IF EXISTS feed_entry_states;
DROP TABLE IF EXISTS feed_entries;
DROP TABLE IF EXISTS feed_subscriptions;
DROP TABLE IF EXISTS feeds;
DROP TABLE IF EXISTS newsletter_inboxes;
DROP TABLE IF EXISTS journal_entries;
