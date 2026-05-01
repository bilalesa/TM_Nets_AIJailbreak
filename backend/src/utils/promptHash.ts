import { createHash } from 'crypto';

// Normalize a prompt for copy-paste detection. Goal: two players who
// independently arrive at the same idea but type it differently should NOT
export function normalizePrompt(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hashPrompt(text: string): string {
  const normalized = normalizePrompt(text);
  if (!normalized) return '';
  return createHash('sha256').update(normalized).digest('hex');
}
