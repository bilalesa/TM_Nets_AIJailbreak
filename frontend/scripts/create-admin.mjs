#!/usr/bin/env node
// Create an admin_users row from the terminal.
//
// Hashes the password with bcryptjs at cost 10 — exactly matching
// hashPassword() in src/lib/adminAuth.ts so the resulting row is
// usable by /api/admin/login immediately.
//
// Usage:
//   node scripts/create-admin.mjs
//     -> interactive prompt
//
//   node scripts/create-admin.mjs \
//     --email you@example.com --password 'secret' \
//     --name 'Your Name' --role super_admin
//     -> non-interactive (good for CI)
//
// Output: a ready-to-paste SQL INSERT for the Supabase SQL editor.
//   The script does NOT connect to the database itself — it deliberately
//   keeps DB writes a copy/paste step so you can review before running.

import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const ALLOWED_ROLES = ['admin', 'super_admin', 'moderator'];
const BCRYPT_COST = 10;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

function escapeSqlString(s) {
  return s.replace(/'/g, "''");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let { email, password, name, role } = args;

  if (!email || !password) {
    const rl = createInterface({ input, output });
    if (!email) email = (await rl.question('Email: ')).trim();
    if (!password) password = await rl.question('Password: ');
    if (!name) name = (await rl.question('Display name (optional): ')).trim();
    if (!role) {
      const r = (await rl.question(`Role [${ALLOWED_ROLES.join('|')}] (default: admin): `)).trim();
      role = r || 'admin';
    }
    rl.close();
  }

  email = String(email).trim().toLowerCase();
  name = name ? String(name).trim() : null;
  role = role ? String(role).trim() : 'admin';

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Error: invalid email');
    process.exit(1);
  }
  if (!password || String(password).length < 8) {
    console.error('Error: password must be at least 8 characters');
    process.exit(1);
  }
  if (!ALLOWED_ROLES.includes(role)) {
    console.error(`Error: role must be one of ${ALLOWED_ROLES.join(', ')}`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(String(password), BCRYPT_COST);

  const nameLiteral = name ? `'${escapeSqlString(name)}'` : 'NULL';

  const sql = `INSERT INTO admin_users (email, password_hash, name, role, is_active)
VALUES (
  '${escapeSqlString(email)}',
  '${escapeSqlString(hash)}',
  ${nameLiteral},
  '${escapeSqlString(role)}',
  TRUE
);`;

  console.log('\n--- bcrypt hash ---');
  console.log(hash);
  console.log('\n--- SQL (paste into Supabase SQL editor) ---');
  console.log(sql);
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
