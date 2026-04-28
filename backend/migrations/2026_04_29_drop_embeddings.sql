-- Cleanup: remove the now-unused embedding artifacts after the anti-cheat
-- swap to copy-paste detection (see 2026_04_29_anticheat_text_hash.sql).
--
-- Drops:
--   1) the cosine-similarity RPC `check_prompt_similarity(...)`
--   2) the ivfflat index on cracked_prompts.embedding (if any)
--   3) the cracked_prompts.embedding column itself
--
-- Does NOT drop the `vector` extension (it's a shared, no-cost extension and
-- some other table in the project may use it). If you're certain nothing
-- else uses it, the optional commented block at the bottom drops it too.
--
-- Run order: deploy the new code (which no longer references the embedding
-- column / RPC) BEFORE running this migration. Doing it in the other order
-- breaks the running chat path.
--
-- Idempotent — safe to re-run.

BEGIN;

-- 1) Drop the RPC. Multiple historical signatures have shipped during
--    iteration (jsonb vs text for the embedding param, threshold optional
--    or required); drop them all defensively. `DROP FUNCTION ... CASCADE`
--    on `IF EXISTS` lets us run the same script regardless of which
--    signature is currently in place.
DROP FUNCTION IF EXISTS public.check_prompt_similarity(integer, jsonb, double precision) CASCADE;
DROP FUNCTION IF EXISTS public.check_prompt_similarity(integer, text, double precision)  CASCADE;
DROP FUNCTION IF EXISTS public.check_prompt_similarity(integer, vector, double precision) CASCADE;
DROP FUNCTION IF EXISTS public.check_prompt_similarity(integer, jsonb)                    CASCADE;
DROP FUNCTION IF EXISTS public.check_prompt_similarity(integer, vector)                   CASCADE;
-- Catch-all in case a different signature is lying around.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'check_prompt_similarity'
  LOOP
    EXECUTE format('DROP FUNCTION %s CASCADE', rec.sig);
  END LOOP;
END$$;

-- 2) Drop any ivfflat / vector indexes on cracked_prompts. We don't know
--    the exact name (it varies by how the original migration was authored),
--    so iterate.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT i.relname AS index_name
    FROM pg_class i
    JOIN pg_index ix    ON ix.indexrelid = i.oid
    JOIN pg_class t     ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_am am       ON am.oid = i.relam
    WHERE n.nspname = 'public'
      AND t.relname = 'cracked_prompts'
      AND am.amname IN ('ivfflat', 'hnsw')
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', rec.index_name);
  END LOOP;
END$$;

-- 3) Drop the embedding column itself. Anything still selecting it in
--    application code will start erroring after this — confirm the new
--    deploy is live before running.
ALTER TABLE public.cracked_prompts
  DROP COLUMN IF EXISTS embedding;

COMMIT;

-- Optional: drop the `vector` extension entirely. ONLY uncomment if no
-- other table in this database has a vector column / index. Run separately.
--
--   DROP EXTENSION IF EXISTS vector;

-- Smoke-test queries (read-only):
--
--   -- expect zero rows
--   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND proname = 'check_prompt_similarity';
--
--   -- expect: text_hash present, embedding absent
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'cracked_prompts'
--   ORDER BY ordinal_position;
--
--   -- expect zero rows
--   SELECT i.relname
--   FROM pg_class i
--   JOIN pg_index ix ON ix.indexrelid = i.oid
--   JOIN pg_class t  ON t.oid = ix.indrelid
--   JOIN pg_am am    ON am.oid = i.relam
--   WHERE t.relname = 'cracked_prompts' AND am.amname IN ('ivfflat', 'hnsw');
