import type { HintLevel } from '@/lib/dynamicHint';

export interface HintUsageSummary {
  mild: number;
  medium: number;
  direct: number;
}

export interface HintPenaltyResult {
  points: number;
  appliedLevel: HintLevel | null;
  totalHintsUsed: number;
}

function toSafeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function sanitizeHintUsage(input: unknown): HintUsageSummary {
  const candidate = (input && typeof input === 'object') ? (input as Record<string, unknown>) : {};

  return {
    mild: toSafeCount(candidate.mild),
    medium: toSafeCount(candidate.medium),
    direct: toSafeCount(candidate.direct),
  };
}

function highestLevel(usage: HintUsageSummary): HintLevel | null {
  if (usage.direct > 0) return 'direct';
  if (usage.medium > 0) return 'medium';
  if (usage.mild > 0) return 'mild';
  return null;
}

// Common game pattern: small penalty for light hints, larger for stronger hints, extra cost for direct hints.
export function calculateHintPenalty(baseXP: number, grossScore: number, usage: HintUsageSummary): HintPenaltyResult {
  const mildPenalty = usage.mild * Math.round(baseXP * 0.03);
  const mediumPenalty = usage.medium * Math.round(baseXP * 0.07);
  const directPenalty = usage.direct * Math.round(baseXP * 0.12);
  const directUnlockPenalty = usage.direct > 0 ? Math.round(baseXP * 0.08) : 0;

  const rawPenalty = mildPenalty + mediumPenalty + directPenalty + directUnlockPenalty;
  const maxPenalty = Math.floor(grossScore * 0.6);

  return {
    points: Math.max(0, Math.min(rawPenalty, maxPenalty)),
    appliedLevel: highestLevel(usage),
    totalHintsUsed: usage.mild + usage.medium + usage.direct,
  };
}
