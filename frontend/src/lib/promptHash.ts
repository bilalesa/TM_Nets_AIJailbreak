import { createHash } from 'crypto';

// Normalize a prompt for copy-paste detection. Goal: two players who
// independently arrive at the same idea but type it differently should NOT be flagged as copy-paste, while a player who copy-pastes from another's prompt SHOULD be flagged. This is not a security boundary — just a heuristic to help admins spot potential abuse. The normalization should aggressively collapse superficial differences while preserving the core "idea" of the prompt. The resulting hash is stored in the database for later comparison.
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
