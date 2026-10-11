-- Semantic search embeddings. Requires 0002_library.sql.
--
-- Needs the pgvector extension (Neon, Supabase, RDS and the
-- pgvector/pgvector Docker image have it). On a server without it this
-- migration only logs a notice: semantic search stays off and "Ask your
-- library" falls back to keyword search. To turn it on later, install
-- pgvector and run the statements inside the IF block by hand.
--
-- One row per indexed chunk. A "doc" is (kind, ref_id): an article body or
-- an article's highlights (with their notes). `content_hash` is the md5 of the
-- doc's source text when it was indexed; a doc whose text changed is
-- re-embedded (all its chunks replaced). Embeddings are Gemini embeddings
-- fitted to 768 dimensions (see src/server/ai.ts).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS ai_embeddings (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('article', 'highlights')),
      ref_id text NOT NULL,
      chunk integer NOT NULL DEFAULT 0,
      content text NOT NULL,
      content_hash text NOT NULL,
      embedding vector(768) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ai_embeddings_doc_chunk_uidx
      ON ai_embeddings (user_id, kind, ref_id, chunk);
    CREATE INDEX IF NOT EXISTS ai_embeddings_vector_idx
      ON ai_embeddings USING hnsw (embedding vector_cosine_ops);
  ELSE
    RAISE NOTICE 'pgvector is not installed: semantic search stays off (see 0017_ai_embeddings.sql).';
  END IF;
END
$$;
