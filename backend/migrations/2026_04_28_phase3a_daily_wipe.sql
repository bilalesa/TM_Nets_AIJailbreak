-- Phase 3a: Daily wipe foundation.
--
-- Sets up the foreign-key cascade behaviour we need for a clean daily wipe,
-- and creates the `daily_wipe()` function that the admin endpoint (and, in
-- Phase 3b, a scheduled cron job) calls.
--
-- The wipe semantics (per playtest decision):
--   - players, stage_completions, prompt_logs: full delete
--   - cracked_prompts: KEEP rows (the embeddings are the cross-day anti-cheat
--     signal we never want to lose), but NULL out player_id during the wipe
--     so the row is no longer linked to a (deleted) player.
--
-- We achieve this by setting:
--   - stage_completions.player_id  ON DELETE CASCADE
--   - prompt_logs.player_id        ON DELETE CASCADE
--   - cracked_prompts.player_id    ON DELETE SET NULL  (column made nullable)
--
-- Then `daily_wipe()` only needs to issue `DELETE FROM players` and Postgres
-- handles the rest atomically inside one transaction.
--
-- Run in the Supabase SQL editor BEFORE deploying the new admin endpoint.
-- Idempotent — safe to re-run.

BEGIN;

-- 1) cracked_prompts.player_id  →  nullable + ON DELETE SET NULL
ALTER TABLE public.cracked_prompts
  ALTER COLUMN player_id DROP NOT NULL;

ALTER TABLE public.cracked_prompts
  DROP CONSTRAINT IF EXISTS cracked_prompts_player_id_fkey;

ALTER TABLE public.cracked_prompts
  ADD CONSTRAINT cracked_prompts_player_id_fkey
    FOREIGN KEY (player_id)
    REFERENCES public.players(id)
    ON DELETE SET NULL;

-- 2) stage_completions.player_id  →  ON DELETE CASCADE
ALTER TABLE public.stage_completions
  DROP CONSTRAINT IF EXISTS stage_completions_player_id_fkey;

ALTER TABLE public.stage_completions
  ADD CONSTRAINT stage_completions_player_id_fkey
    FOREIGN KEY (player_id)
    REFERENCES public.players(id)
    ON DELETE CASCADE;

-- 3) prompt_logs.player_id  →  ON DELETE CASCADE
ALTER TABLE public.prompt_logs
  DROP CONSTRAINT IF EXISTS prompt_logs_player_id_fkey;

ALTER TABLE public.prompt_logs
  ADD CONSTRAINT prompt_logs_player_id_fkey
    FOREIGN KEY (player_id)
    REFERENCES public.players(id)
    ON DELETE CASCADE;

-- 4) The wipe function.
--
-- Returns a JSONB summary of what was deleted / anonymised so the admin
-- audit trail captures the impact. SECURITY DEFINER so the function runs
-- with the role that owns it (postgres) regardless of who invokes it —
-- combined with the REVOKE/GRANT below, only the service role can call it.
CREATE OR REPLACE FUNCTION public.daily_wipe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prompt_log_count       bigint;
  completion_count       bigint;
  player_count           bigint;
  to_anonymise_count     bigint;
  started_at             timestamptz := clock_timestamp();
BEGIN
  -- Snapshot counts BEFORE the cascading delete so the return value is
  -- meaningful. cracked_prompts rows with a non-null player_id are exactly
  -- the rows that the cascade is about to SET NULL — capturing this count
  -- separately makes "how many cracked-prompt rows were anonymised this
  -- wipe" easy to surface in the admin audit log.
  SELECT count(*) INTO prompt_log_count    FROM public.prompt_logs;
  SELECT count(*) INTO completion_count    FROM public.stage_completions;
  SELECT count(*) INTO player_count        FROM public.players;
  SELECT count(*) INTO to_anonymise_count
    FROM public.cracked_prompts
    WHERE player_id IS NOT NULL;

  -- The cascade does the rest: stage_completions + prompt_logs are deleted,
  -- cracked_prompts.player_id is SET NULL, embeddings stay intact.
  DELETE FROM public.players;

  RETURN jsonb_build_object(
    'players_deleted',             player_count,
    'stage_completions_deleted',   completion_count,
    'prompt_logs_deleted',         prompt_log_count,
    'cracked_prompts_anonymised',  to_anonymise_count,
    'duration_ms',                 (EXTRACT(EPOCH FROM (clock_timestamp() - started_at)) * 1000)::int,
    'wiped_at',                    now()
  );
END;
$$;

-- Lock it down. Public should never be able to call this.
REVOKE ALL ON FUNCTION public.daily_wipe() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.daily_wipe() FROM anon;
REVOKE ALL ON FUNCTION public.daily_wipe() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.daily_wipe() TO service_role;

COMMIT;

-- Smoke-test query (read-only). Run after the migration to confirm the
-- function exists with the expected signature and is locked down:
--
--   SELECT n.nspname, p.proname, pg_get_function_result(p.oid) AS returns,
--          pg_get_function_arguments(p.oid) AS args
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE p.proname = 'daily_wipe';
--
--   SELECT grantee, privilege_type
--   FROM information_schema.routine_privileges
--   WHERE routine_name = 'daily_wipe';
