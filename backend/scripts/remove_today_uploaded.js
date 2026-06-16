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

  // 1. Fetch records
  const { data: recordsData, error: recordsError } = await supabase
    .from('app_state')
    .select('payload')
    .eq('state_key', 'records')
    .single();

  if (recordsError) {
    console.error('Error fetching records:', recordsError.message);
    return;
  }

  const records = recordsData?.payload || [];
  console.log(`Fetched ${records.length} records from Supabase.`);

  // 2. Fetch history
  const { data: historyData, error: historyError } = await supabase
    .from('app_state')
    .select('payload')
    .eq('state_key', 'history')
    .single();

  const history = historyData?.payload || [];

  const todayStr = '2026-06-16';

  // Find the IDs of the records that were created today
  // Let's look at the upload history to verify when the upload happened:
  // Today's upload was completed at "2026-06-16T04:11:28.336Z"
  // So any record created at "2026-06-16T04:11..." is part of today's upload.
  
  let deletedCount = 0;
  let revertedCount = 0;
  let keptCount = 0;

  const nextRecords = [];

  for (const r of records) {
    const isToday = r.updatedAt && r.updatedAt.startsWith(todayStr);

    if (isToday) {
      // Check if it was newly created today or was auto-archived
      const isAutoArchived = r.remark && (r.remark.includes('Auto-Archived') || r.remark === 'Payment Done (Auto-Archived)');
      
      if (isAutoArchived) {
        // Revert auto-archived record back to active
        const revertedRec = { ...r };
        
        // Find previous status/remark in remarkHistory if available
        let prevCallStatus = 'Pending';
        let prevRemark = '';
        if (r.remarkHistory && r.remarkHistory.length > 0) {
          const lastHistory = r.remarkHistory[r.remarkHistory.length - 1];
          prevCallStatus = lastHistory.callStatus || 'Pending';
          prevRemark = lastHistory.remark || '';
        } else {
          // If no history, clean the auto-archive suffix
          if (r.remark.includes(' | Auto-Archived')) {
            prevRemark = r.remark.split(' | Auto-Archived')[0];
          } else if (r.remark === 'Payment Done (Auto-Archived)') {
            prevRemark = '';
          }
        }

        revertedRec.callStatus = prevCallStatus;
        revertedRec.status = 'Bounced';
        revertedRec.remark = prevRemark;
        revertedRec.followUpDate = '';
        revertedRec.followUpTime = '';
        revertedRec.reminderEnabled = false;
        
        // Reset updatedAt to yesterday
        revertedRec.updatedAt = '2026-06-15T00:00:00.000Z';

        nextRecords.push(revertedRec);
        revertedCount++;
      } else {
        // Newly created record today -> Delete it
        deletedCount++;
      }
    } else {
      // Old record -> Keep it
      nextRecords.push(r);
      keptCount++;
    }
  }

  console.log('--- ACTION SUMMARY ---');
  console.log(`Deleted (newly created today): ${deletedCount}`);
  console.log(`Reverted (auto-archived today): ${revertedCount}`);
  console.log(`Kept (unchanged): ${keptCount}`);
  console.log(`New total records: ${nextRecords.length}`);

  if (dryRun) {
    console.log('Dry run complete. No changes made to database. Run with --execute to apply changes.');
    return;
  }

  // 3. Save records back to Supabase
  console.log('Saving reverted records to Supabase...');
  const { error: saveError } = await supabase
    .from('app_state')
    .upsert({
      state_key: 'records',
      payload: nextRecords,
      updated_at: new Date().toISOString()
    }, { onConflict: 'state_key' });

  if (saveError) {
    console.error('Error saving records:', saveError.message);
    return;
  }
  console.log('Successfully saved records to Supabase!');

  // 4. Remove today's upload entry from history
  const nextHistory = history.filter(h => !h.completedAt || !h.completedAt.startsWith(todayStr));
  console.log(`Removing today's upload from history (previous count: ${history.length}, new count: ${nextHistory.length})`);
  
  const { error: saveHistoryError } = await supabase
    .from('app_state')
    .upsert({
      state_key: 'history',
      payload: nextHistory,
      updated_at: new Date().toISOString()
    }, { onConflict: 'state_key' });

  if (saveHistoryError) {
    console.error('Error saving history:', saveHistoryError.message);
    return;
  }
  console.log('Successfully updated upload history in Supabase!');
}

run().catch(console.error);
