// frontend/src/lib/avatar.ts

export function getAvatarUrl(username: string): string {
  // DiceBear v9 - free, no API key needed
  // Using 'bottts' style for a tech/cyber aesthetic that fits the AI jailbreak theme
  const seed = encodeURIComponent(username);
  return `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${seed}&backgroundColor=1e293b,0f172a,1a1a2e&backgroundType=solid`;
}

// Compute XP bonus from time: faster = more bonus XP (max 50% of baseXP)
export function computeTimeBonus(elapsedSeconds: number, baseXP: number): number {
  // Under 60s → full bonus (50% of base)
  // 60–300s  → linear decay
  if (elapsedSeconds <= 60) return Math.round(baseXP * 0.5);
  if (elapsedSeconds >= 300) return 0;
  const ratio = 1 - (elapsedSeconds - 60) / 240;
  return Math.round(baseXP * 0.5 * ratio);
}
