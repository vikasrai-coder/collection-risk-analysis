import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

// Local PG connection
const localPool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://apple@localhost:5432/collection_risk',
});

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export async function findUserByEmail(email) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();

      if (!error && data) {
        return data;
      }
    } catch (e) {
      console.error('Supabase findUser failed, falling back to local PG:', e);
    }
  }

  // Fallback to local PG
  const res = await localPool.query(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
    [email.trim()]
  );
  return res.rows[0] || null;
}

export async function createUser({ email, password, role }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const normalizedEmail = email.toLowerCase().trim();

  let createdUser = null;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .upsert({
          email: normalizedEmail,
          password_hash: passwordHash,
          role,
          is_active: true
        }, { onConflict: 'email' })
        .select()
        .single();

      if (!error && data) {
        createdUser = data;
        // Mirror to local PG in the background
        localPool.query(
          `INSERT INTO users (email, password_hash, role, is_active)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (email)
           DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
          [normalizedEmail, passwordHash, role]
        ).catch(() => {});
      }
    } catch (e) {
      console.error('Supabase createUser failed, falling back to local PG:', e);
    }
  }

  if (!createdUser) {
    const res = await localPool.query(
      `INSERT INTO users (email, password_hash, role, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (email)
       DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
       RETURNING *`,
      [normalizedEmail, passwordHash, role]
    );
    createdUser = res.rows[0];
  }

  return createdUser;
}

export async function getAllUsers() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, role, is_active, created_at')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data;
      }
    } catch (e) {
      console.error('Supabase getAllUsers failed, falling back to local PG:', e);
    }
  }

  const res = await localPool.query(
    'SELECT id, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
  );
  return res.rows;
}
