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
  const { data, error } = await supabase
    .from('app_state')
    .select('payload')
    .eq('state_key', 'records')
    .single();

  if (error) {
    console.error('Error fetching state:', error.message);
    return;
  }

  const records = data?.payload || [];
  
  // Find all records for Khare Associates (USR-77062) or Puja Hospitality (USR-59484)
  console.log('--- ALL RECORDS FOR USR-77062 (KHARE ASSOCIATES) ---');
  const khare = records.filter(r => r.userId === 'USR-77062' || r.customerName.includes('KHARE'));
  console.log(khare.map(r => ({
    id: r.id,
    userId: r.userId,
    customerName: r.customerName,
    callStatus: r.callStatus,
    status: r.status,
    defaultAmount: r.defaultAmount,
    updatedAt: r.updatedAt
  })));

  console.log('--- ALL RECORDS FOR USR-59484 (PUJA HOSPITALITY) ---');
  const puja = records.filter(r => r.userId === 'USR-59484' || r.customerName.includes('PUJA'));
  console.log(puja.map(r => ({
    id: r.id,
    userId: r.userId,
    customerName: r.customerName,
    callStatus: r.callStatus,
    status: r.status,
    defaultAmount: r.defaultAmount,
    updatedAt: r.updatedAt
  })));
}

run().catch(console.error);
