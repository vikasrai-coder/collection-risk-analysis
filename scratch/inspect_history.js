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
    .select('payload')
    .eq('state_key', 'history')
    .single();

  if (error) {
    console.error('Error fetching history:', error.message);
    return;
  }

  const history = data?.payload || [];
  console.log('--- UPLOAD HISTORY ---');
  console.log(JSON.stringify(history.slice(0, 10), null, 2));
}

run().catch(console.error);
