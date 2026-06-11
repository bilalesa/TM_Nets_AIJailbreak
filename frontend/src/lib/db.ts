// frontend/src/lib/db.ts
// pg Pool singleton — shared across all server-side DB operations.

import pkg from 'pg';
const { Pool } = pkg;

declare global {
  // eslint-disable-next-line no-var
  var pgPool: InstanceType<typeof Pool> | undefined;
}

const pool =
  global.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== 'production') global.pgPool = pool;

export { pool };
