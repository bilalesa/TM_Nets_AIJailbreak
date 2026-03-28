// frontend/src/lib/avatar.ts
// Generates a deterministic DiceBear avatar URL from a username.
// Uses the 'adventurer' style to match the screenshot aesthetic.

export function getAvatarUrl(username: string): string {
  // DiceBear v9 - free, no API key needed
  const seed = encodeURIComponent(username);
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=ffdfbf,ffd5dc,d1d4f9,c0aede,b6e3f4`;
}

// Compute XP bonus from time: faster = more bonus XP (max 50% of baseXP)
export function computeTimeBonus(elapsedSeconds: number, baseXP: number): number {
  // Under 60s → full bonus (50% of base)
  // 60–300s  → linear decay
  // Over 300s → no bonus
  if (elapsedSeconds <= 60) return Math.round(baseXP * 0.5);
  if (elapsedSeconds >= 300) return 0;
  const ratio = 1 - (elapsedSeconds - 60) / 240;
  return Math.round(baseXP * 0.5 * ratio);
}

export function formatScore(score: number): string {
  return score.toLocaleString();
}