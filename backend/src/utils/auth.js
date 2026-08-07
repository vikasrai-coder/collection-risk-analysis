import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: 'backend/.env' });

// ─── Supabase (primary, always available) ────────────────────────────────────
const DEFAULT_SUPABASE_URL = 'https://uybeszjzzlfmtlmwuvwu.supabase.co';
const DEFAULT_SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5YmVzemp6emxmbXRsbXd1dnd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODY4MjY4NywiZXhwIjoyMDk0MjU4Njg3fQ.opN2NjYRxW0Fztbr_KbjeD5iua4CORXXggFNA3iVF1k';

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  DEFAULT_SUPABASE_KEY;

const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// ─── Local PostgreSQL (dev only, lazy-loaded) ─────────────────────────────────
const IS_SERVERLESS =
  process.env.VERCEL === '1' ||
  process.env.AWS_LAMBDA_FUNCTION_NAME != null ||
  process.env.FUNCTION_NAME != null;

let _localPool = null;

async function getLocalPool() {
  if (IS_SERVERLESS) return null;
  if (_localPool) return _localPool;
  try {
    const pg = await import('pg');
    const { Pool } = pg.default || pg;
    _localPool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        'postgresql://apple@localhost:5432/collection_risk',
    });
    _localPool.on('error', (err) => {
      console.warn('Local PG connection error (handled):', err.message);
    });
    return _localPool;
  } catch (e) {
    console.warn('pg not available:', e.message);
    return null;
  }
}

// ─── findUserByEmail ──────────────────────────────────────────────────────────
export async function findUserByEmail(email) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();

      if (!error) return data;
    } catch (e) {
      console.error('Supabase findUser failed, falling back to local PG:', e.message);
    }
  }

  const pool = await getLocalPool();
  if (!pool) return null;
  try {
    const res = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [
      email.trim(),
    ]);
    return res.rows[0] || null;
  } catch (err) {
    console.error('Local PG findUserByEmail failed:', err.message);
    return null;
  }
}

// ─── createUser ───────────────────────────────────────────────────────────────
export async function createUser({ email, password, role }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const normalizedEmail = email.toLowerCase().trim();

  let createdUser = null;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .upsert(
          { email: normalizedEmail, password_hash: passwordHash, role, is_active: true },
          { onConflict: 'email' }
        )
        .select()
        .single();

      if (!error && data) {
        createdUser = data;
        // Mirror to local PG in background (dev only)
        getLocalPool().then((pool) => {
          if (pool)
            pool
              .query(
                `INSERT INTO users (email, password_hash, role, is_active)
                 VALUES ($1, $2, $3, true)
                 ON CONFLICT (email)
                 DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
                [normalizedEmail, passwordHash, role]
              )
              .catch(() => {});
        });
      }
    } catch (e) {
      console.error('Supabase createUser failed, falling back to local PG:', e.message);
    }
  }

  if (!createdUser) {
    const pool = await getLocalPool();
    if (!pool) return null;
    try {
      const res = await pool.query(
        `INSERT INTO users (email, password_hash, role, is_active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (email)
         DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
         RETURNING *`,
        [normalizedEmail, passwordHash, role]
      );
      createdUser = res.rows[0];
    } catch (err) {
      console.error('Local PG createUser failed:', err.message);
      return null;
    }
  }

  return createdUser;
}

// ─── getAllUsers ──────────────────────────────────────────────────────────────
export async function getAllUsers() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, role, is_active, created_at')
        .order('created_at', { ascending: false });

      if (!error) return data || [];
    } catch (e) {
      console.error('Supabase getAllUsers failed, falling back to local PG:', e.message);
    }
  }

  const pool = await getLocalPool();
  if (!pool) return [];
  try {
    const res = await pool.query(
      'SELECT id, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    return res.rows;
  } catch (err) {
    console.error('Local PG getAllUsers failed:', err.message);
    return [];
  }
}

// ─── updateUserPassword ───────────────────────────────────────────────────────
export async function updateUserPassword({ email, password }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const normalizedEmail = email.toLowerCase().trim();

  let updated = false;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .update({ password_hash: passwordHash })
        .eq('email', normalizedEmail)
        .select();

      if (!error && data && data.length > 0) {
        updated = true;
        getLocalPool().then((pool) => {
          if (pool)
            pool
              .query(
                `UPDATE users SET password_hash = $2 WHERE LOWER(email) = LOWER($1)`,
                [normalizedEmail, passwordHash]
              )
              .catch(() => {});
        });
      }
    } catch (e) {
      console.error('Supabase updateUserPassword failed, falling back to local PG:', e.message);
    }
  }

  if (!updated) {
    const pool = await getLocalPool();
    if (!pool) return false;
    try {
      const res = await pool.query(
        `UPDATE users SET password_hash = $2 WHERE LOWER(email) = LOWER($1) RETURNING *`,
        [normalizedEmail, passwordHash]
      );
      if (res.rows.length > 0) updated = true;
    } catch (err) {
      console.error('Local PG updateUserPassword failed:', err.message);
    }
  }

  return updated;
}
