import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('users')
    .select('*');

  if (error) {
    console.error('Error fetching users:', error.message);
    return;
  }

  console.log('--- SUPABASE USERS ---');
  console.table(data.map(u => ({
    id: u.id,
    email: u.email,
    role: u.role,
    is_active: u.is_active,
    created_at: u.created_at
  })));
}

run().catch(console.error);
