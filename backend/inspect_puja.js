import dotenv from 'dotenv';
import pkg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log('inspecting USR-59484 in postgres...');
  const res = pool.query("SELECT * FROM collections WHERE customer_id = 'USR-59484' OR customer_name ILIKE '%PUJA%'", async (err, data) => {
    if (err) {
      console.error(err);
    } else {
      console.log(JSON.stringify(data.rows, null, 2));
    }
    await pool.end();
  });
}

run().catch(console.error);
