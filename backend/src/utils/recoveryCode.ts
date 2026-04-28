// backend/src/utils/recoveryCode.ts
//
// Cryptographic recovery code system that replaces the email-based re-login
// path. On signup the server generates a random 16-char code from a
// human-readable alphabet and returns it ONCE; the player saves it and uses
// it later (different device, expired cookie, cleared browser) to recover
// their account. The hash — not the code — is persisted on the player row.
//
// Security model
// --------------
//  - 16 chars × 5 bits/char = 80 bits of entropy. Online brute force is
//    rate-limited; offline brute force of the hash needs ~2^80 work.
//  - scrypt (Node stdlib) is used to derive the hash with a per-row salt.
//    Default cost (~50ms per hash) is acceptable at signup and naturally
//    rate-limits the recover endpoint.
//  - Compares are constant-time via timingSafeEqual.
//  - The plaintext code is shown to the player exactly once and is never
//    logged.

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

// Unambiguous alphabet — drops 0/O/1/I/L to avoid transcription errors when
// a player writes the code down or photographs it.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 16;
const GROUP_SIZE = 4;

const SCRYPT_KEYLEN = 32;
const SALT_BYTES = 16;
// Stored format: scrypt$<saltHex>$<hashHex>. Versioned prefix so we can
// migrate to a different KDF later without breaking existing rows.
const STORED_PREFIX = 'scrypt$';

function pickRandomChar(): string {
  // Rejection-sample a uniformly random index into ALPHABET. crypto.randomInt
  // would also work; this loop is explicit so the bias-free property is
  // obvious even with a non-power-of-two alphabet length.
  while (true) {
    const buf = randomBytes(1);
    const value = buf[0];
    // Largest multiple of ALPHABET.length that fits in a byte (256 = 8*32).
    // For 32-char alphabet, every byte is in range, so the loop never
    // retries — but we keep the guard in case the alphabet changes.
    const limit = 256 - (256 % ALPHABET.length);
    if (value < limit) return ALPHABET[value % ALPHABET.length];
  }
}

/**
 * Generates a fresh recovery code, e.g. "ABCD-EFGH-JKLM-NPQR".
 * Hyphens are cosmetic; verifyRecoveryCode normalizes them away.
 */
export function generateRecoveryCode(): string {
  let raw = '';
  for (let i = 0; i < CODE_LENGTH; i++) raw += pickRandomChar();
  // Re-format with hyphens every GROUP_SIZE chars for readability.
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += GROUP_SIZE) {
    groups.push(raw.slice(i, i + GROUP_SIZE));
  }
  return groups.join('-');
}

/**
 * Strips hyphens / whitespace and uppercases. Done before hashing on signup
 * AND before comparing on recover, so the player can paste the code with or
 * without the formatting characters.
 */
export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[-\s]/g, '').toUpperCase();
}

/**
 * Hashes a code with a fresh per-row salt. Returns the stored representation
 * `scrypt$<saltHex>$<hashHex>` for direct insertion into recovery_code_hash.
 */
export function hashRecoveryCode(code: string): string {
  const normalized = normalizeRecoveryCode(code);
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(normalized, salt, SCRYPT_KEYLEN);
  return `${STORED_PREFIX}${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Constant-time verify. Returns false on any malformed stored value rather
 * than throwing — stored hashes from older code paths just fail to match.
 */
export function verifyRecoveryCode(code: string, stored: string | null): boolean {
  if (!stored || !stored.startsWith(STORED_PREFIX)) return false;
  const parts = stored.slice(STORED_PREFIX.length).split('$');
  if (parts.length !== 2) return false;
  const [saltHex, hashHex] = parts;
  let saltBuf: Buffer;
  let expected: Buffer;
  try {
    saltBuf = Buffer.from(saltHex, 'hex');
    expected = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }
  if (saltBuf.length !== SALT_BYTES || expected.length !== SCRYPT_KEYLEN) return false;
  const normalized = normalizeRecoveryCode(code);
  let derived: Buffer;
  try {
    derived = scryptSync(normalized, saltBuf, SCRYPT_KEYLEN);
  } catch {
    return false;
  }
  // timingSafeEqual requires equal-length buffers, which we just verified.
  return timingSafeEqual(derived, expected);
}
