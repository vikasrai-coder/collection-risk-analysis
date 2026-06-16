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
  const dryRun = process.argv.includes('--execute') ? false : true;
  console.log(`Running in ${dryRun ? 'DRY-RUN' : 'EXECUTE'} mode...`);

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
  console.log(`Total interaction logs in DB: ${logs.length}`);

  const todayStr = '2026-06-16';
  
  // Filter out logs created today that are System Import or Auto-Archive logs
  const nextLogs = logs.filter(l => {
    const isToday = l.updatedAt && l.updatedAt.startsWith(todayStr);
    if (isToday) {
      const isSystemLog = l.updatedBy === 'System Import' || l.updatedBy === 'System (Auto-Archive)' || l.id.startsWith('auto-archive-') || l.id.startsWith('sheet-import-');
      return !isSystemLog; // remove if system log
    }
    return true; // keep others
  });

  const removedCount = logs.length - nextLogs.length;
  console.log(`Logs to remove: ${removedCount}`);
  console.log(`New logs count: ${nextLogs.length}`);

  if (dryRun) {
    console.log('Dry run complete. No changes made to database.');
    return;
  }

  const { error: saveError } = await supabase
    .from('app_state')
    .upsert({
      state_key: 'interaction_logs',
      payload: nextLogs,
      updated_at: new Date().toISOString()
    }, { onConflict: 'state_key' });

  if (saveError) {
    console.error('Error saving logs:', saveError.message);
    return;
  }
  console.log('Successfully cleaned up interaction logs in Supabase!');
}

run().catch(console.error);
