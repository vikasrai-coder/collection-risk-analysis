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
  const todayStr = '2026-06-16';
  const todayRecords = records.filter(r => r.updatedAt && r.updatedAt.startsWith(todayStr));

  const withRemarkHistory = todayRecords.filter(r => r.remarkHistory && r.remarkHistory.length > 0);
  const withoutRemarkHistory = todayRecords.filter(r => !r.remarkHistory || r.remarkHistory.length === 0);

  console.log(`Today's records: ${todayRecords.length}`);
  console.log(`  With remarkHistory: ${withRemarkHistory.length}`);
  console.log(`  Without remarkHistory: ${withoutRemarkHistory.length}`);

  if (withRemarkHistory.length > 0) {
    console.log('\nSample today records WITH remarkHistory:');
    console.log(withRemarkHistory.slice(0, 10).map(r => ({
      id: r.id,
      userId: r.userId,
      customerName: r.customerName,
      lender: r.lender,
      remark: r.remark,
      remarkHistory: r.remarkHistory,
      updatedAt: r.updatedAt
    })));
  }
}

run().catch(console.error);
