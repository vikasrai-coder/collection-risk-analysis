import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('🔄 Syncing followup to Supabase...');
  const { error } = await supabase.from('customer_followups').upsert({
    id: 'f25dfd6f-2394-4d1a-85d0-999320e84bc9',
    customer_id: 'USR-59484',
    loan_id: '',
    remark: 'Not answerig the call',
    call_status: 'No Answer',
    created_by: '0d8a8a02-e201-442f-9878-f4cf1479e0c4',
    updated_at: new Date().toISOString()
  });

  if (error) {
    console.error('  ✗ Supabase sync failed:', error.message);
  } else {
    console.log('  ✓ Supabase followup sync completed successfully!');
  }
}

run().catch(console.error);
