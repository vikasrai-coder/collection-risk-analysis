import dotenv from 'dotenv';
import pkg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const { Pool } = pkg;
const localPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  console.log('--- DISTINCT NBFC/LENDER NAMES IN collections ---');
  try {
    const res = await localPool.query('SELECT DISTINCT lender FROM collections');
    console.table(res.rows);
  } catch (e) {
    console.error('Error:', e.message);
  }

  console.log('--- SAMPLE COLLECTIONS ---');
  try {
    const res = await localPool.query('SELECT customer_id, loan_id, customer_name, lender, amount, status FROM collections LIMIT 10');
    console.table(res.rows);
  } catch (e) {
    console.error('Error:', e.message);
  }

  await localPool.end();
}

check().catch(console.error);
