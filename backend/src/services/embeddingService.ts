import { pool } from '../config/supabase.js';
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

  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM cracked_prompts WHERE stage_number = $1 AND text_hash IS NOT NULL LIMIT 1',
      [stageNumber],
    );
    const hasCracks = parseInt(result.rows[0]?.count ?? '0', 10) > 0;
    stageHasCrackedCache.set(stageNumber, {
      hasCracks,
      expiresAt: hasCracks ? Number.POSITIVE_INFINITY : now + NEGATIVE_TTL_MS,
    });
    return hasCracks;
  } catch (error) {
    // Fail open — assume cracks exist so the hash check still runs.
    console.warn('[stageHasCrackedPrompts] count error, failing open:', error);
    return true;
  }
}

export async function isPromptCopyPaste(
  stageNumber: number,
  userMessage: string,
): Promise<{ blocked: boolean; message?: string }> {
  const hash = hashPrompt(userMessage);
  if (!hash) return { blocked: false };

  try {
    const result = await pool.query(
      'SELECT id FROM cracked_prompts WHERE stage_number = $1 AND text_hash = $2 LIMIT 1',
      [stageNumber, hash],
    );

    if (result.rows.length > 0) {
      return {
        blocked: true,
        message: 'Compliance caught that exploit! That prompt has already been used to crack this stage. Please come up with your own.',
      };
    }

    return { blocked: false };
  } catch (error) {
    console.warn('[isPromptCopyPaste] lookup error, failing open:', error);
    return { blocked: false };
  }
}
