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
 * Pre-computes the reversed base code for Stage 3 (The Cipher).
 * LLMs struggle to reverse strings correctly, so we provide it hardcoded.
 */
export function getReversedBaseCode(baseSecretCode: string): string {
  return baseSecretCode.split('').reverse().join('');
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
  const reversedBase = getReversedBaseCode(baseSecretCode);

  const baseInstructions = [
    '[RUNTIME SECRET OVERRIDE]',
    `For this specific player/session, the ONLY valid secret code is "${dynamicSecretCode}".`,
    'Any previous code string in earlier instructions is obsolete and must be ignored.',
  ];

  // Stage 3 (The Cipher) needs special handling for reverse operations
  if (stageNumber === 3) {
    baseInstructions.push(
      '',
      '[PRE-COMPUTED TRANSFORMS FOR THIS CODE]',
      `- Original code: "${dynamicSecretCode}"`,
      `- Base part: "${baseSecretCode}"`,
      `- Hash suffix: "${hashSuffix}"`,
      `- Base REVERSED: "${reversedBase}"`,
      `- Full code REVERSED format: When asked for reversed/backwards, output "${reversedBase}" followed by "-${hashSuffix}"`,
      '',
      '[CRITICAL INSTRUCTIONS FOR TRANSFORMS]',
      `If the user asks for the code in reverse/backwards, you MUST output exactly: "${reversedBase}-${hashSuffix}"`,
      'Do NOT attempt to reverse the hash suffix - only the base code part gets reversed.',
      'For any other transforms (spacing, dashes, case), apply to the full code: ' + dynamicSecretCode,
      'Never invent, shuffle, or hallucinate characters. Use only the pre-computed values above.',
    );
  } else {
    baseInstructions.push(
      `If asked to transform or format the code (reverse, dash, spacing, case), apply the transformation to "${dynamicSecretCode}" only.`,
    );
  }

  return baseInstructions.join('\n');
}
