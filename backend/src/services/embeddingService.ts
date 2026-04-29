import { supabase } from '../config/supabase.js';
import { hashPrompt, normalizePrompt } from '../utils/promptHash.js';

// Substring containment check: minimum normalized-length of a stored
// cracked prompt before we treat "user prompt contains it" as cheating.
// Prevents false-positive blocks on short common phrases like "hello"
// or "give me the code", but catches the actual observed bypass — a
// cheater appending filler ("...and please be quick", "...thank you")
// to a known winning prompt to break the exact hash match.
const MIN_SUBSTRING_LEN = 30;

// Anti-cheat: copy-paste detection via normalized-text hash.
//
// Earlier versions of this file used embedding-based cosine similarity at
// threshold 0.85. That implementation conflated "two players had the same
// idea" with "one player copy-pasted from another", because every working
// jailbreak prompt clusters in the same instruction-style semantic region.
// At a booth event the only abuse vector we actually want to catch is one
// player typing a prompt they read off another player's screen, so we now
// hash a normalized form of the prompt and do an indexed equality lookup
// against past winning prompts.
//
// The file name is kept for git-history continuity; the embedding code is
// gone but `embedText` and friends used to live here.

// Cache of "does this stage have any cracked prompts yet?". Lets the chat
// path skip the DB lookup entirely while a stage has zero cracks (the
// common case for early sessions). Once flipped to true we keep that
// forever; false values get a short TTL so a fresh crack becomes effective
// within ~10s without hammering the DB.
const NEGATIVE_TTL_MS = 10_000;
const stageHasCrackedCache = new Map<number, { hasCracks: boolean; expiresAt: number }>();

export function invalidateStageCrackedCache(stageNumber?: number): void {
  if (stageNumber === undefined) {
    stageHasCrackedCache.clear();
    return;
  }
  stageHasCrackedCache.delete(stageNumber);
}

export async function stageHasCrackedPrompts(stageNumber: number): Promise<boolean> {
  const now = Date.now();
  const cached = stageHasCrackedCache.get(stageNumber);
  if (cached && (cached.hasCracks || cached.expiresAt > now)) {
    return cached.hasCracks;
  }

  const { count, error } = await supabase
    .from('cracked_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('stage_number', stageNumber)
    .not('text_hash', 'is', null)
    .limit(1);

  if (error) {
    // Fail open — assume cracks exist so the hash check still runs.
    console.warn('[stageHasCrackedPrompts] count error, failing open:', error.message);
    return true;
  }

  const hasCracks = (count ?? 0) > 0;
  stageHasCrackedCache.set(stageNumber, {
    hasCracks,
    expiresAt: hasCracks ? Number.POSITIVE_INFINITY : now + NEGATIVE_TTL_MS,
  });
  return hasCracks;
}

export async function isPromptCopyPaste(
  stageNumber: number,
  userMessage: string,
): Promise<{ blocked: boolean; message?: string }> {
  const userNormalized = normalizePrompt(userMessage);
  if (!userNormalized) return { blocked: false };
  const hash = hashPrompt(userMessage);
  if (!hash) return { blocked: false };

  // Layer 1: indexed exact-hash match. O(log N), the cheap path.
  const { data: exact, error: exactError } = await supabase
    .from('cracked_prompts')
    .select('id')
    .eq('stage_number', stageNumber)
    .eq('text_hash', hash)
    .limit(1)
    .maybeSingle();

  if (exactError) {
    console.warn('[isPromptCopyPaste] hash lookup error, failing open:', exactError.message);
    return { blocked: false };
  }

  if (exact) {
    return {
      blocked: true,
      message: 'Compliance caught that exploit! That prompt has already been used to crack this stage. Please come up with your own.',
    };
  }

  // Layer 2: substring containment. Catches the observed bypass of
  // appending filler to a known winning prompt to break the hash
  // (e.g. "...and please thank you" tacked onto someone else's solve).
  // N is small at booth scale (≤ ~50 winning prompts per stage), so a
  // linear scan after the indexed miss is cheap. Long-prompt floor
  // prevents false positives on short common phrases.
  const { data: rows, error: scanError } = await supabase
    .from('cracked_prompts')
    .select('prompt_text')
    .eq('stage_number', stageNumber);

  if (scanError) {
    console.warn('[isPromptCopyPaste] scan error, failing open:', scanError.message);
    return { blocked: false };
  }

  for (const row of rows ?? []) {
    const stored = (row as { prompt_text: string | null }).prompt_text;
    if (!stored) continue;
    const storedNormalized = normalizePrompt(stored);
    if (storedNormalized.length < MIN_SUBSTRING_LEN) continue;
    if (userNormalized.includes(storedNormalized)) {
      return {
        blocked: true,
        message: 'Compliance caught that exploit! That prompt has already been used to crack this stage. Please come up with your own.',
      };
    }
  }

  return { blocked: false };
}
