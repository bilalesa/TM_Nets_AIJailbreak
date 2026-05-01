// Recovery code system for account recovery using scrypt-hashed 16-char codes.
// Security: 80-bit entropy, per-row salt, constant-time comparison.

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

// Unambiguous alphabet (no 0/O/1/I/L to avoid transcription errors)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 16;
const GROUP_SIZE = 4;
const SCRYPT_KEYLEN = 32;
const SALT_BYTES = 16;
const STORED_PREFIX = 'scrypt$';

function pickRandomChar(): string {
  while (true) {
    const buf = randomBytes(1);
    const value = buf[0];
    const limit = 256 - (256 % ALPHABET.length);
    if (value < limit) return ALPHABET[value % ALPHABET.length];
  }
}

/** Generates a formatted recovery code, e.g. "ABCD-EFGH-JKLM-NPQR". */
export function generateRecoveryCode(): string {
  let raw = '';
  for (let i = 0; i < CODE_LENGTH; i++) raw += pickRandomChar();
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += GROUP_SIZE) {
    groups.push(raw.slice(i, i + GROUP_SIZE));
  }
  return groups.join('-');
}

/** Normalizes code by removing hyphens/whitespace and uppercasing. */
export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[-\s]/g, '').toUpperCase();
}

/** Hashes a code with a fresh salt. Returns `scrypt$<salt>$<hash>` for storage. */
export function hashRecoveryCode(code: string): string {
  const normalized = normalizeRecoveryCode(code);
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(normalized, salt, SCRYPT_KEYLEN);
  return `${STORED_PREFIX}${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Constant-time verify. Returns false on malformed stored values. */
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
  return timingSafeEqual(derived, expected);
}
