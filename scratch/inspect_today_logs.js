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
    .eq('state_key', 'interaction_logs')
    .single();

  if (error) {
    console.error('Error fetching logs:', error.message);
    return;
  }

  const logs = data?.payload || [];
  console.log(`Total interaction logs: ${logs.length}`);

  const todayStr = '2026-06-16';
  const todayLogs = logs.filter(l => l.updatedAt && l.updatedAt.startsWith(todayStr));

  console.log(`Today's interaction logs: ${todayLogs.length}`);
  console.log(JSON.stringify(todayLogs.slice(0, 10), null, 2));
}

run().catch(console.error);
