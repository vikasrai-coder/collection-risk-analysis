import dotenv from 'dotenv';
import pkg from 'pg';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const { Pool } = pkg;
const localPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log('--- LOCAL DB CHECK ---');
  try {
    const localRes = await localPool.query('SELECT state_key, length(payload::text) as len, updated_at FROM app_state');
    console.table(localRes.rows);
  } catch (e) {
    console.error('Local error:', e.message);
  }

  console.log('--- SUPABASE CHECK ---');
  try {
    const { data, error } = await supabase.from('app_state').select('state_key, updated_at');
    if (error) throw error;
    console.table(data);
  } catch (e) {
    console.error('Supabase error:', e.message);
  }

  console.log('--- COLLECTIONS COUNT ---');
  try {
    const localCount = await localPool.query('SELECT count(*) FROM collections');
    console.log('Local collections:', localCount.rows[0].count);
  } catch (e) {
    console.error('Local collections error:', e.message);
  }

  try {
    const { count, error } = await supabase.from('collections').select('*', { count: 'exact', head: true });
    if (error) throw error;
    console.log('Supabase collections:', count);
  } catch (e) {
    console.error('Supabase collections error:', e.message);
  }

  await localPool.end();
}

check().catch(console.error);
