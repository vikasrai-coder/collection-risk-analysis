import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data, error } = await supabase.from('app_state').select('*').limit(1);
  if (error) {
    console.error('Table app_state might not exist:', error.message);
  } else {
    console.log('Table app_state exists!');
  }
}

test();
