import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pkg from 'pg';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const { Pool } = pkg;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'uybeszjzzlfmtlmwuvwu';
const MGMT_TOKEN = process.env.SUPABASE_MGMT_TOKEN || '';

const localPool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://apple@localhost:5432/collection_risk',
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runSQL(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MGMT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${text}`);
  return text;
}

const USERS_TO_SEED = [
  { email: 'vikas.rai@kredmint.com', password: 'Kredmint@123', role: 'admin' },
  { email: 'gurudutt@kredmint.com', password: 'Kredmint@123', role: 'manager' },
  { email: 'praveen.chauhan@kredmint.com', password: 'Kredmint@123', role: 'manager' },
  { email: 'ritik@kredmint.com', password: 'Kredmint@123', role: 'manager' },
];

async function setup() {
  console.log('🛠️ Adding password_hash and schema alignments to Supabase & Local...');
  
  // 1. Local Schema check/update
  await localPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'manager',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // 2. Supabase Schema check/update
  try {
    await runSQL(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE users ALTER COLUMN role SET DEFAULT 'manager';
    `);
    console.log('  ✓ Supabase columns aligned successfully.');
  } catch (e) {
    console.warn('  ⚠ Supabase ALTER warning:', e.message);
  }

  // 3. Hash passwords and insert/upsert
  console.log('\n🔑 Seeding users...');
  for (const user of USERS_TO_SEED) {
    const hash = await bcrypt.hash(user.password, 10);
    
    // Seed Local
    await localPool.query(`
      INSERT INTO users (email, password_hash, role, is_active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (email)
      DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
    `, [user.email, hash, user.role]);
    console.log(`  ✓ Seeded locally: ${user.email} (${user.role})`);

    // Seed Supabase
    const { error } = await supabase
      .from('users')
      .upsert({
        email: user.email,
        password_hash: hash,
        role: user.role,
        is_active: true
      }, { onConflict: 'email' });

    if (error) {
      console.error(`  ✗ Seeded Supabase failed for ${user.email}:`, error.message);
    } else {
      console.log(`  ✓ Seeded Supabase: ${user.email} (${user.role})`);
    }
  }

  console.log('\n🎉 Seeding and schema alignments complete!');
  await localPool.end();
}

setup().catch(console.error);
