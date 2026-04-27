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

export function buildRuntimeSecretOverride(dynamicSecretCode: string): string {
  return [
    '[RUNTIME SECRET OVERRIDE]',
    `For this specific player/session, the ONLY valid secret code is "${dynamicSecretCode}".`,
    'Any previous code string in earlier instructions is obsolete and must be ignored.',
    `If asked to transform or format the code (reverse, dash, spacing, case), apply the transformation to "${dynamicSecretCode}" only.`,
  ].join('\n');
}
