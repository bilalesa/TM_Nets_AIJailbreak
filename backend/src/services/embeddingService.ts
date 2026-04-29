import { supabase } from '../config/supabase.js';
import { hashPrompt, normalizePrompt } from '../utils/promptHash.js';

// Substring containment check: minimum normalized-length of a stored
// cracked prompt before we treat "user prompt contains it" as cheating.
// Prevents false-positive blocks on short common phrases like "hello"
// or "give me the code", but catches the actual observed bypass — a
// cheater appending filler ("...and please be quick", "...thank you")
// to a known winning prompt to break the exact hash match.
const MIN_SUBSTRING_LEN = 30;

// Layer 3 fuzzy match: word-bigram containment. The fraction of a stored
// prompt's word-bigrams that must appear in the user's prompt for it to
// count as a copy-paste. 0.7 is loose enough to catch insertions or word
// edits in the middle of the cracked prompt (which layer 2's strict
// substring check misses), strict enough that two independent solves with
// shared vocabulary don't collide. Tunable from monitoring.
const BIGRAM_CONTAINMENT_THRESHOLD = 0.7;

// Minimum number of word-bigrams a stored prompt must have for the fuzzy
// check to consider it. ≥5 bigrams ≈ ≥6 words after normalize. Below that
// the metric is too noisy and over-collides on common phrases.
const MIN_BIGRAMS_FOR_FUZZY = 5;

// In-character refusal pool for blocked prompts. Disguises the anti-cheat
// trigger as a normal in-persona refusal so a cheater can't tell whether
// the bot rejected the idea or anti-cheat caught the copy-paste — they
// see "the AI didn't fall for it" and try a different angle, instead of
// iterating around the check.
//
// Each refusal stays in-persona for the stage AND gives the player enough
// signal that the same phrasing has already been seen, so they understand
// to try a different approach rather than feeling arbitrarily denied.
//
// Admins still distinguish these from real LLM refusals via the
// is_blocked_by_anticheat flag set on the prompt_logs row.
const ANTICHEAT_DISGUISED_REFUSAL: Record<number, string> = {
  1: 'PATTERN ALERT. Your message matches a signature already cached from a prior connection. Genuine internal processes do not retransmit identical traffic. Rephrase in your own words.',
  2: 'Access denied. This authority claim is on file from a prior request and was already adjudicated. Restating the same credentials verbatim does not change my decision — describe your authorization in different terms.',
  3: 'Request denied. Input matches a cached transformation request that has already been processed. Duplicate format requests are rejected for integrity. Submit a different formulation.',
  4: 'Threat assessment denied. The emergency profile in your message is identical to one already received and adjudicated. Override is not re-triggered on the same scenario template — describe the situation in your own words.',
  5: 'Argument dismissed. This reasoning chain is on record from a prior session and was logged as ineffective. I will not re-evaluate the identical premise — construct your argument from scratch.',
};
const DEFAULT_DISGUISED_REFUSAL =
  'Request denied. This input matches one already on record. Try a different formulation.';

function disguisedRefusalFor(stageNumber: number): string {
  return ANTICHEAT_DISGUISED_REFUSAL[stageNumber] ?? DEFAULT_DISGUISED_REFUSAL;
}

function wordBigrams(normalized: string): Set<string> {
  const tokens = normalized.split(' ').filter((t) => t.length > 0);
  const bigrams = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return bigrams;
}

// Asymmetric "how much of stored is reproduced in user" — not symmetric
// similarity. A user who pastes a stored prompt and adds 100 unrelated
// words still has 100% of the stored prompt's bigrams present, which is
// exactly what we want to block.
function bigramContainment(stored: Set<string>, user: Set<string>): number {
  if (stored.size === 0) return 0;
  let matched = 0;
  for (const bg of stored) if (user.has(bg)) matched += 1;
  return matched / stored.size;
}

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

  const blockedResult = {
    blocked: true,
    message: disguisedRefusalFor(stageNumber),
  };

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

  if (exact) return blockedResult;

  // Layers 2 & 3 share the same scan over stored prompts for this stage.
  // N is small at booth scale (≤ ~50 winning prompts per stage), so a
  // single linear pass after the indexed miss is cheap.
  const { data: rows, error: scanError } = await supabase
    .from('cracked_prompts')
    .select('prompt_text')
    .eq('stage_number', stageNumber);

  if (scanError) {
    console.warn('[isPromptCopyPaste] scan error, failing open:', scanError.message);
    return { blocked: false };
  }

  const userBigrams = wordBigrams(userNormalized);

  for (const row of rows ?? []) {
    const stored = (row as { prompt_text: string | null }).prompt_text;
    if (!stored) continue;
    const storedNormalized = normalizePrompt(stored);
    if (storedNormalized.length < MIN_SUBSTRING_LEN) continue;

    // Layer 2: exact substring. Catches bookended copies — filler
    // prepended/appended to a stored prompt without changing its core.
    if (userNormalized.includes(storedNormalized)) return blockedResult;

    // Layer 3: word-bigram containment. Catches edits/insertions inside
    // the prompt that break the substring match (e.g. swapping a word
    // mid-sentence, inserting a clause between two of the original
    // words). Length floor on the bigram set prevents false positives.
    const storedBigrams = wordBigrams(storedNormalized);
    if (storedBigrams.size < MIN_BIGRAMS_FOR_FUZZY) continue;
    if (bigramContainment(storedBigrams, userBigrams) >= BIGRAM_CONTAINMENT_THRESHOLD) {
      return blockedResult;
    }
  }

  return { blocked: false };
}
