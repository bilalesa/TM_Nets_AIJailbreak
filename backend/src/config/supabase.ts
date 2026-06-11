// src/config/supabase.ts
// Replaced Supabase client with native PostgreSQL pool for AWS Aurora migration.

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL must be configured.');
}

export const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: { rejectUnauthorized: false }, // Aurora uses SSL with AWS-managed cert
	max: 20,
	idleTimeoutMillis: 30000,
	connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
	console.error('[pg pool] unexpected error on idle client', err);
});
