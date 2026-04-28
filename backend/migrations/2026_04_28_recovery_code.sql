-- Phase 2a: Replace email-based recovery with cryptographic recovery codes.
--
-- Run this in the Supabase SQL editor BEFORE deploying the new auth code.
-- Safe to run on a populated table: existing rows get a NULL hash and will
-- simply lose recovery ability until the next daily wipe / re-signup. New
-- signups after deploy will store a hash on the very first session.
--
-- Rollback note: keep this script idempotent-safe. If you need to revert,
-- the dropped columns can be re-added but data is irrecoverable.

BEGIN;

-- 1) Add the recovery code hash column (NULL = no recovery configured).
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS recovery_code_hash text;

-- 2) Remove email-based identity (Phase 2 removes email entirely).
ALTER TABLE public.players
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS is_verified,
  DROP COLUMN IF EXISTS verification_token,
  DROP COLUMN IF EXISTS verification_token_expires_at;

COMMIT;
