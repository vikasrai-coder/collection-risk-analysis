import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
dotenv.config({ path: 'backend/.env' });

// ─── Supabase (primary on Vercel) ────────────────────────────────────────────
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
// We never import pg at module scope to avoid crashes in Vercel serverless.
// A pool is only created when explicitly needed (local dev, non-serverless env).
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
    const connectionString =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/collection_risk';
    _localPool = new Pool({ connectionString });
    _localPool.on('error', (err) => {
      console.warn('Local PG connection error (handled):', err.message);
    });
    return _localPool;
  } catch (e) {
    console.warn('pg not available, skipping local pool:', e.message);
    return null;
  }
}

let activeTarget = 'supabase';

export async function query(text, params) {
  // Skip CREATE TABLE on Supabase (JS client doesn't support raw SQL)
  if (text.trim().toUpperCase().startsWith('CREATE TABLE')) {
    if (supabase) return { rows: [] };
    const pool = await getLocalPool();
    if (!pool) return { rows: [] };
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.warn('Local PG schema query skipped:', err.message);
      return { rows: [] };
    }
  }

  // ── SELECT from app_state ───────────────────────────────────────────────────
  if (text.includes('FROM app_state')) {
    if (supabase) {
      try {
        let keys = params;
        if (!keys || !Array.isArray(keys) || keys.length === 0) {
          const match = text.match(/state_key\s*=\s*'([^']+)'/i);
          if (match && match[1]) keys = [match[1]];
        }

        if (keys && Array.isArray(keys) && keys.length > 0) {
          const { data, error } = await supabase
            .from('app_state')
            .select('state_key, payload, updated_at')
            .in('state_key', keys);

          if (!error) {
            activeTarget = 'supabase';
            const safeData = data || [];
            if (text.trim().toLowerCase().startsWith('select payload')) {
              return { rows: safeData.map((item) => ({ payload: item.payload })) };
            }
            return { rows: safeData };
          }
          console.warn('Supabase app_state select error, trying local:', error.message);
        }
      } catch (e) {
        console.error('Supabase fetch failed:', e.message);
      }
    }

    // Local PG fallback (dev only)
    activeTarget = 'local';
    const pool = await getLocalPool();
    if (!pool) return { rows: [] };
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.error('Local PG state select failed:', err.message);
      return { rows: [] };
    }
  }

  // ── INSERT / UPSERT into app_state ─────────────────────────────────────────
  if (text.includes('INSERT INTO app_state')) {
    if (supabase) {
      try {
        const [state_key, payload] = params;
        const { error } = await supabase.from('app_state').upsert({
          state_key,
          payload: typeof payload === 'string' ? JSON.parse(payload) : payload,
          updated_at: new Date().toISOString(),
        });

        if (!error) {
          activeTarget = 'supabase';
          // Mirror to local PG in background (dev only, best-effort)
          getLocalPool().then((pool) => {
            if (pool) pool.query(text, params).catch(() => {});
          });
          return { ok: true };
        }
        console.warn('Supabase app_state upsert error:', error.message);
      } catch (e) {
        console.error('Supabase save failed, falling back to local PG:', e.message);
      }
    }

    activeTarget = 'local';
    const pool = await getLocalPool();
    if (!pool) return { ok: false, error: 'No database available' };
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.error('Local PG state insert failed:', err.message);
      return { ok: false, error: err.message };
    }
  }

  // ── Default fallback ────────────────────────────────────────────────────────
  const pool = await getLocalPool();
  if (!pool) return { rows: [] };
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('Local PG fallback query failed:', err.message);
    return { rows: [] };
  }
}

export function getDatabaseStatus() {
  return {
    activeTarget,
    supabaseEnabled: Boolean(supabase),
  };
}
