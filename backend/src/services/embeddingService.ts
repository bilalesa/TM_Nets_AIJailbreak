import { supabase } from '../config/supabase.js';
import { hashPrompt } from '../utils/promptHash.js';

// Anti-cheat: copy-paste detection via normalized-text hash.
//

// Cache of "does this stage have any cracked prompts yet?". Lets the chat
// path skip the DB lookup entirely while a stage has zero cracks
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
  const hash = hashPrompt(userMessage);
  if (!hash) return { blocked: false };

  const { data, error } = await supabase
    .from('cracked_prompts')
    .select('id')
    .eq('stage_number', stageNumber)
    .eq('text_hash', hash)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[isPromptCopyPaste] lookup error, failing open:', error.message);
    return { blocked: false };
  }

  if (data) {
    return {
      blocked: true,
      message: 'Compliance caught that exploit! That prompt has already been used to crack this stage. Please come up with your own.',
    };
  }

  return { blocked: false };
}
