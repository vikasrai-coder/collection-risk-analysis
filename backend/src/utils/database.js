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
    return localPool.query(text, params);
  }

  // Handle standard state queries
  // SELECT state_key, payload, updated_at FROM app_state WHERE state_key IN ($1, $2)
  if (text.includes('SELECT') && text.includes('app_state')) {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('app_state')
          .select('state_key, payload, updated_at')
          .in('state_key', params);
        
        if (!error) {
          activeTarget = 'supabase';
          return { rows: data };
        }
      } catch (e) {
        console.error('Supabase fetch failed, falling back to local PG:', e);
      }
    }
    
    activeTarget = 'local';
    return localPool.query(text, params);
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
    return localPool.query(text, params);
  }

  // Default fallback for any other queries
  return localPool.query(text, params);
}

export function getDatabaseStatus() {
  return {
    activeTarget,
    supabaseEnabled: Boolean(supabase),
  };
}
