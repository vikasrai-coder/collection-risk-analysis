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
  console.log('inspecting USR-59484...');
  const res = await pool.query("SELECT * FROM collections WHERE customer_id = 'USR-59484' OR customer_name ILIKE '%PUJA%'");
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
}

run().catch(console.error);
