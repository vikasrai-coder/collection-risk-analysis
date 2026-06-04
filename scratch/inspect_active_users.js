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
    .from('app_state')
    .select('*')
    .eq('state_key', 'active_users')
    .single();

  if (error) {
    console.error('Error fetching active_users:', error.message);
    return;
  }

  console.log('--- SUPABASE ACTIVE USERS STATE ---');
  console.log('Updated At:', data.updated_at);
  console.log('Payload:', JSON.stringify(data.payload, null, 2));
}

run().catch(console.error);
