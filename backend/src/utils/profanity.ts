// Profanity filter. Used for username validation at signup and as a
// pre-LLM gate on chat prompts.
//
// Matching strategy:
//   1. Lowercase the input
//   2. Normalize common leetspeak substitutions (4→a, 3→e, 1→i/l, 0→o, 5→s, 7→t, @→a, $→s)
//   3. Strip non-letter characters so "f.u.c.k" / "f_u_c_k" still match
//   4. Substring match against the wordlist
//
// This is intentionally simple — meant to catch lazy attempts, not pass an
// adversarial test. Tune the list to your audience.

const RAW_WORDS = [
  'fuck',
  'fucker',
  'fucking',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'dick',
  'pussy',
  'cock',
  'whore',
  'slut',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'retarded',
  'kike',
  'spic',
  'chink',
  'gook',
  'tranny',
  'twat',
  'wanker',
  'jerkoff',
  'motherfucker',
  'mthrfckr',
  'cumshot',
  'porn',
  'rape',
  'rapist',
];

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[4@]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z]/g, '');
}

const NORMALIZED_WORDS = RAW_WORDS.map(normalize);

export function containsProfanity(input: string): boolean {
  if (!input) return false;
  const normalized = normalize(input);
  if (!normalized) return false;
  return NORMALIZED_WORDS.some((w) => w.length > 0 && normalized.includes(w));
}

export function findProfanity(input: string): string | null {
  if (!input) return null;
  const normalized = normalize(input);
  for (let i = 0; i < NORMALIZED_WORDS.length; i++) {
    const w = NORMALIZED_WORDS[i];
    if (w && normalized.includes(w)) return RAW_WORDS[i] ?? w;
  }
  return null;
}
