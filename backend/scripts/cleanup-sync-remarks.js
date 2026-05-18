import dotenv from 'dotenv';
import pkg from 'pg';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const { Pool } = pkg;
const localPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanup() {
  console.log('🧹 Starting database cleanup of "Daily Sheet Sync" entries...');

  // 1. Clean up "records" state key
  console.log('\n📊 Cleaning up records payload...');
  const recordsRes = await localPool.query("SELECT payload FROM app_state WHERE state_key = 'records'");
  if (recordsRes.rows.length > 0) {
    let records = recordsRes.rows[0].payload;
    if (typeof records === 'string') records = JSON.parse(records);
    
    if (Array.isArray(records)) {
      let recordsUpdatedCount = 0;
      records.forEach(r => {
        if (r.remark === 'Daily Sheet Sync') {
          r.remark = '';
          recordsUpdatedCount++;
        }
      });
      console.log(`  Found and scrubbed ${recordsUpdatedCount} records with "Daily Sheet Sync" remarks.`);

      // Update both Local PG and Supabase
      await localPool.query("UPDATE app_state SET payload = $1::jsonb, updated_at = NOW() WHERE state_key = 'records'", [JSON.stringify(records)]);
      await supabase.from('app_state').upsert({ state_key: 'records', payload: records, updated_at: new Date().toISOString() });
      console.log('  ✓ Updated records in local PostgreSQL and Supabase.');
    }
  }

  // 2. Clean up "interaction_logs" state key
  console.log('\n📅 Cleaning up interaction_logs payload...');
  const logsRes = await localPool.query("SELECT payload FROM app_state WHERE state_key = 'interaction_logs'");
  if (logsRes.rows.length > 0) {
    let logs = logsRes.rows[0].payload;
    if (typeof logs === 'string') logs = JSON.parse(logs);
    
    if (Array.isArray(logs)) {
      const originalCount = logs.length;
      const filteredLogs = logs.filter(log => log.remark !== 'Daily Sheet Sync');
      const removedCount = originalCount - filteredLogs.length;
      console.log(`  Purged ${removedCount} timeline sync events from interaction history.`);

      // Update both Local PG and Supabase
      await localPool.query("UPDATE app_state SET payload = $1::jsonb, updated_at = NOW() WHERE state_key = 'interaction_logs'", [JSON.stringify(filteredLogs)]);
      await supabase.from('app_state').upsert({ state_key: 'interaction_logs', payload: filteredLogs, updated_at: new Date().toISOString() });
      console.log('  ✓ Updated interaction_logs in local PostgreSQL and Supabase.');
    }
  }

  // 3. Clean up the relational followups table just in case
  console.log('\n🧹 Cleaning up relational customer_followups table...');
  const followupsRes = await localPool.query("UPDATE customer_followups SET remark = '' WHERE remark = 'Daily Sheet Sync'");
  console.log(`  ✓ Updated ${followupsRes.rowCount || 0} rows in customer_followups table.`);

  console.log('\n✨ Database cleanup complete! All "Daily Sheet Sync" residues successfully purged.');
  await localPool.end();
}

cleanup().catch(console.error);
