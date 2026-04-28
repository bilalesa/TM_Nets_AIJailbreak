-- Phase 2b: Fingerprint snapshot on stage_completions for admin audit, plus
-- a safety unique constraint on (player_id, stage_number).
--
-- Originally scoped as a runtime block ("same fingerprint can't clear the
-- same stage twice across accounts") but iOS Safari normalizes fingerprints
-- heavily across identical iPhone models — at a booth event with shared
-- device profiles this produces an unacceptable false-positive rate. The
-- snapshot is preserved for forensic review (admin can spot a cluster of
-- accounts all sharing one fingerprint clearing all stages in minutes and
-- nuke the offending completions manually) but no runtime enforcement.

BEGIN;

-- 1) Snapshot column. NULL = legacy completion or browser without
--    crypto.subtle. Recorded at win time so it survives later fingerprint
--    rotation via /api/auth/recover.
ALTER TABLE public.stage_completions
  ADD COLUMN IF NOT EXISTS client_fingerprint text;

-- 2) Hardens the existing application-level double-submission guard
--    against races (two simultaneous validate-code calls from the same
--    player+stage). This is independent of fingerprinting.
ALTER TABLE public.stage_completions
  ADD CONSTRAINT stage_completions_player_stage_unique
    UNIQUE (player_id, stage_number);

-- 3) Speeds up admin queries that group by fingerprint to find clusters,
--    e.g. "show me every fingerprint that has more than 3 completions
--    across distinct accounts". Partial index skips the (large, irrelevant)
--    NULL bucket.
CREATE INDEX IF NOT EXISTS stage_completions_stage_fp_idx
  ON public.stage_completions (stage_number, client_fingerprint)
  WHERE client_fingerprint IS NOT NULL;

COMMIT;
