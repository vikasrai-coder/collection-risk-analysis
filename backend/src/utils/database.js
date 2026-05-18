import pkg from 'pg';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const { Pool } = pkg;

// Local PostgreSQL configuration
const localConnectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/collection_risk';

const localPool = new Pool({
  connectionString: localConnectionString,
});

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

let activeTarget = 'local';

export async function query(text, params) {
  // If this is a schema setup query, only run it locally for now 
  // (Supabase JS client doesn't support raw SQL)
  if (text.trim().toUpperCase().startsWith('CREATE TABLE')) {
    try {
      return await localPool.query(text, params);
    } catch (err) {
      console.error('Local PG schema setup failed:', err.message);
      return { rows: [] };
    }
  }

  // Handle standard state queries
  // SELECT state_key, payload, updated_at FROM app_state WHERE state_key IN ($1, $2)
  if (text.includes('SELECT') && text.includes('app_state')) {
    if (supabase) {
      try {
        let keys = params;
        if (!keys || !Array.isArray(keys) || keys.length === 0) {
          // Attempt to extract single key from query string, e.g. state_key = 'telegram_settings'
          const match = text.match(/state_key\s*=\s*'([^']+)'/i);
          if (match && match[1]) {
            keys = [match[1]];
          }
        }

        if (keys && Array.isArray(keys) && keys.length > 0) {
          const { data, error } = await supabase
            .from('app_state')
            .select('state_key, payload, updated_at')
            .in('state_key', keys);
          
          if (!error && data) {
            activeTarget = 'supabase';
            // Map payloads to return expected structure
            if (text.trim().toLowerCase().startsWith('select payload')) {
              return { rows: data.map(item => ({ payload: item.payload })) };
            }
            return { rows: data };
          }
        }
      } catch (e) {
        console.error('Supabase fetch failed, falling back to local PG:', e);
      }
    }
    
    activeTarget = 'local';
    try {
      return await localPool.query(text, params);
    } catch (err) {
      console.error('Local PG state select failed:', err.message);
      return { rows: [] };
    }
  }

  // INSERT INTO app_state ... ON CONFLICT ...
  if (text.includes('INSERT INTO app_state')) {
    if (supabase) {
      try {
        const [state_key, payload] = params;
        const { error } = await supabase
          .from('app_state')
          .upsert({ 
            state_key, 
            payload: typeof payload === 'string' ? JSON.parse(payload) : payload,
            updated_at: new Date().toISOString()
          });
        
        if (!error) {
          activeTarget = 'supabase';
          // Also mirror to local PG for true fallback capability
          localPool.query(text, params).catch(() => {});
          return { ok: true };
        }
      } catch (e) {
        console.error('Supabase save failed, falling back to local PG:', e);
      }
    }
    
    activeTarget = 'local';
    try {
      return await localPool.query(text, params);
    } catch (err) {
      console.error('Local PG state insert failed:', err.message);
      return { ok: false, error: err.message };
    }
  }

  // Default fallback for any other queries
  try {
    return await localPool.query(text, params);
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
