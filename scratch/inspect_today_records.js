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
    .eq('state_key', 'records')
    .single();

  if (error) {
    console.error('Error fetching state:', error.message);
    return;
  }

  const records = data?.payload || [];
  console.log(`Total records in DB: ${records.length}`);

  const todayStr = '2026-06-16';
  const todayRecords = records.filter(r => r.updatedAt && r.updatedAt.startsWith(todayStr));

  const withRemarks = todayRecords.filter(r => r.remark && r.remark.trim() !== "");
  const withoutRemarks = todayRecords.filter(r => !r.remark || r.remark.trim() === "");

  console.log(`Today's records: ${todayRecords.length}`);
  console.log(`  With remarks: ${withRemarks.length}`);
  console.log(`  Without remarks: ${withoutRemarks.length}`);

  console.log('\nSample today records WITH remarks (first 5):');
  console.log(withRemarks.slice(0, 5).map(r => ({
    id: r.id,
    userId: r.userId,
    customerName: r.customerName,
    lender: r.lender,
    remark: r.remark,
    updatedAt: r.updatedAt
  })));
}

run().catch(console.error);
