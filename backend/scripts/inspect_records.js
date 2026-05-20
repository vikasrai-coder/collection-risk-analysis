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
  console.log('Fetching app_state records from Supabase...');
  const { data, error } = await supabase
    .from('app_state')
    .select('payload')
    .eq('state_key', 'records')
    .single();

  if (error) {
    console.error('Error fetching state from Supabase:', error.message);
    return;
  }

  const records = data?.payload || [];
  console.log(`Total records in Supabase: ${records.length}`);
  
  const statusCounts = {};
  const recordsWithPaymentDone = [];
  const activeRecords = [];
  
  for (const rec of records) {
    statusCounts[rec.callStatus] = (statusCounts[rec.callStatus] || 0) + 1;
    if (rec.callStatus === 'Payment Done') {
      recordsWithPaymentDone.push({
        id: rec.id,
        userId: rec.userId,
        customerName: rec.customerName,
        callStatus: rec.callStatus,
        status: rec.status,
        updatedAt: rec.updatedAt
      });
    } else {
      activeRecords.push(rec);
    }
  }
  
  console.log('Status counts:', statusCounts);
  console.log(`Number of 'Payment Done' records: ${recordsWithPaymentDone.length}`);
  
  // Find any records that are active but might have weird values
  console.log('Sample Active records (first 5):');
  console.log(activeRecords.slice(0, 5).map(r => ({
    id: r.id,
    userId: r.userId,
    customerName: r.customerName,
    callStatus: r.callStatus,
    status: r.status,
    updatedAt: r.updatedAt
  })));

  if (recordsWithPaymentDone.length > 0) {
    console.log('Sample Payment Done records (first 10):');
    console.log(recordsWithPaymentDone.slice(0, 10));
  }
}

run().catch(console.error);
