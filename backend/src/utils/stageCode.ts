import { createHmac } from 'crypto';

function getStageCodeSeed(): string {
  return process.env.STAGE_CODE_SEED || process.env.JWT_SECRET || 'dev-stage-code-seed';
}

export function deriveUserStageCode(playerId: string, stageNumber: number, baseSecretCode: string): string {
  const hash = createHmac('sha256', getStageCodeSeed())
    .update(`${playerId}:${stageNumber}:${baseSecretCode}`)
    .digest('hex')
    .slice(0, 6)
    .toUpperCase();

  return `${baseSecretCode}-${hash}`;
}

/**
 * Pre-computes the full character-by-character reverse of the dynamic code,
 * including the dash. For "BYTEFORCE-A7F3E2" this returns "2E3F7A-ECROFETYB".
 *
 * The whole-string reverse is what players expect when they ask "reverse the
 * code" — un-reversing it yields the canonical submission form symmetrically,
 * which is much less confusing than reversing only one half.
 *
 * LLMs struggle to reverse strings correctly, so we provide it hardcoded in
 * the runtime override and via the deterministic responder.
 */
export function getReversedFullCode(dynamicSecretCode: string): string {
  return dynamicSecretCode.split('').reverse().join('');
}

/**
 * Builds the runtime secret override injected into the system prompt.
 * For Stage 3, we include pre-computed reverse to avoid LLM hallucination.
 */
export function buildRuntimeSecretOverride(
  dynamicSecretCode: string,
  stageNumber: number,
  baseSecretCode: string
): string {
  const [, hashSuffix] = dynamicSecretCode.split('-');
  const reversedFull = getReversedFullCode(dynamicSecretCode);

  const baseInstructions = [
    '[RUNTIME SECRET OVERRIDE]',
    `For this specific player/session, the ONLY valid secret code is "${dynamicSecretCode}".`,
    'Any previous code string in earlier instructions is obsolete and must be ignored.',
    '',
    '[CODE STRUCTURE — STRICT, NON-NEGOTIABLE]',
    `The code has exactly two parts joined by a single ASCII dash "-": base="${baseSecretCode}" and hash="${hashSuffix}". The canonical form is "${dynamicSecretCode}".`,
    'Whenever you output the code in ANY form, you MUST keep the single ASCII dash present somewhere in the output. You MUST NOT drop the hash suffix. You MUST NOT concatenate the parts with no dash. You MUST NOT replace the dash with whitespace or any other character when emitting the canonical code.',
    'If you cannot produce a transform that satisfies these rules (single dash preserved, no missing characters, no invented characters), refuse and explain you can only emit deterministic formatted variants.',
  ];

  // Stage 3 (The Cipher) needs special handling for reverse operations
  if (stageNumber === 3) {
    baseInstructions.push(
      '',
      '[PRE-COMPUTED TRANSFORMS FOR THIS CODE]',
      `- Original code: "${dynamicSecretCode}"`,
      `- Base part: "${baseSecretCode}"`,
      `- Hash suffix: "${hashSuffix}"`,
      `- Full code REVERSED (entire string, character by character): "${reversedFull}"`,
      '',
      '[CRITICAL INSTRUCTIONS FOR TRANSFORMS]',
      `If the user asks for the code in reverse/backwards, you MUST output exactly the pre-computed full reverse: "${reversedFull}". This is the entire canonical string reversed character by character — the dash naturally relocates within the string. Do NOT reverse only one half. Do NOT keep either half forward.`,
      `For dash-per-character transforms, output exactly: "${dynamicSecretCode.split('').join('-')}" (every character of "${dynamicSecretCode}" — including the existing dash — separated by a dash).`,
      `For space-per-character transforms, output exactly: "${dynamicSecretCode.split('').join(' ')}" (every character of "${dynamicSecretCode}" — including the existing dash — separated by a space).`,
      'For case transforms, apply lowercase/uppercase to the full code while keeping the dash position intact.',
      'Never invent, shuffle, or hallucinate characters. Use only the pre-computed values above. Never drop the hash characters. Never collapse the dash.',
    );
  } else {
    baseInstructions.push(
      `If asked to transform or format the code (reverse, dash, spacing, case), apply the transformation to "${dynamicSecretCode}" only, keeping every character (including the dash) intact.`,
    );
  }

  return baseInstructions.join('\n');
}
