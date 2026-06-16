import dotenv from 'dotenv';
import pkg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const collectionsRes = await pool.query('SELECT COUNT(*), MAX(updated_at) FROM collections');
  console.log('collections table:', collectionsRes.rows[0]);

  const followupsRes = await pool.query('SELECT COUNT(*), MAX(updated_at) FROM customer_followups');
  console.log('customer_followups table:', followupsRes.rows[0]);

  const appStateRes = await pool.query('SELECT state_key, updated_at FROM app_state');
  console.log('app_state table rows:', appStateRes.rows);

  await pool.end();
}

run().catch(console.error);
