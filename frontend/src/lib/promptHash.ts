import { createHash } from 'crypto';

// Normalize a prompt for copy-paste detection. Goal: two players who
// independently arrive at the same idea but type it differently should NOT
// collide; a player who reads another booth visitor's screen and types the
// exact same characters (with sloppy capitalization or extra spaces) SHOULD.
//
// Steps:
//   1. Lowercase
//   2. Strip punctuation (keep letters, digits, whitespace)
//   3. Collapse runs of whitespace to a single space
//   4. Trim
//
// Keep this function bit-identical to backend/src/utils/promptHash.ts —
// they hash the same way so the chat-time check and the win-time save
// agree on what "the same prompt" means.
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
