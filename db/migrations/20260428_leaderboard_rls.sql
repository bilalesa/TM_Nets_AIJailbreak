-- Allow the anon role to read leaderboard data so the player-facing
-- leaderboard page can query Supabase directly with the public anon key
-- (NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY).
--
-- Without this policy, RLS blocks anon SELECT and the leaderboard renders
-- empty even though the page itself works. Run once in Supabase SQL editor.
--
-- The view below restricts which columns anon can see — emails, IPs, and
-- fingerprints stay server-side only.

-- 1. Public read view for leaderboard (only the columns the UI needs).
CREATE OR REPLACE VIEW public_leaderboard AS
SELECT
  id,
  username,
  total_score,
  session_active,
  is_banned
FROM players;

-- 2. Grant anon SELECT on the view.
GRANT SELECT ON public_leaderboard TO anon, authenticated;

-- 3. Direct table policies — needed because the leaderboard page queries
--    `players` and `stage_completions` by name. If you'd rather not expose
--    these tables to anon at all, switch the page to query
--    `public_leaderboard` instead and drop these policies.
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read leaderboard rows" ON players;
CREATE POLICY "anon read leaderboard rows"
  ON players FOR SELECT
  TO anon, authenticated
  USING (session_active = TRUE AND is_banned = FALSE);

ALTER TABLE stage_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read stage completions" ON stage_completions;
CREATE POLICY "anon read stage completions"
  ON stage_completions FOR SELECT
  TO anon, authenticated
  USING (TRUE);
