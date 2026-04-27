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

