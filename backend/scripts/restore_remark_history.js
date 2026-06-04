import dotenv from 'dotenv';
import pkg from 'pg';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const { Pool } = pkg;
const localPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/collection_risk'
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

async function run() {
  console.log('🔄 Initiating Remarks History data recovery...');

  try {
    // 1. Fetch records and interaction_logs from local PG
    const recordsRes = await localPool.query("SELECT payload FROM app_state WHERE state_key = 'records'");
    const rawRecords = recordsRes.rows[0]?.payload || [];

    const logsRes = await localPool.query("SELECT payload FROM app_state WHERE state_key = 'interaction_logs'");
    const interactionLogs = logsRes.rows[0]?.payload || [];

    if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
      console.log('⚠️ No local records found to repair.');
      await localPool.end();
      return;
    }

    console.log(`📡 Loaded ${rawRecords.length} records and ${interactionLogs.length} interaction logs.`);

    // 2. Reconstruct remarkHistory for each record
    let repairedCount = 0;
    const repairedRecords = rawRecords.map(rec => {
      const logsForRecord = interactionLogs.filter(
        log => log && log.remark && log.remark.trim() && 
               (log.userId === rec.userId || log.loanId === rec.loanId)
      );

      // Convert matching logs to RemarkEntry objects
      const logsAsRemarks = logsForRecord.map(log => ({
        id: log.id,
        text: log.remark.trim(),
        timestamp: log.updatedAt,
        addedBy: log.updatedBy || 'Agent'
      }));

      // Combine direct history and log remarks
      const combined = [
        ...(rec.remarkHistory || []),
        ...logsAsRemarks
      ];

      // Filter out empty / daily sheet sync events (cleanup)
      const valid = combined.filter(entry => entry && entry.text && entry.text.trim() && entry.text !== 'Daily Sheet Sync');

      // Deduplicate remarks by text, addedBy, and timestamp (rounded to minute)
      const uniqueRemarks = Array.from(
        new Map(
          valid.map(entry => {
            const dateStr = entry.timestamp ? new Date(entry.timestamp).toISOString().slice(0, 16) : '';
            const key = `${entry.text.trim()}-${entry.addedBy || ''}-${dateStr}`;
            return [key, entry];
          })
        ).values()
      );

      // Sort uniqueRemarks chronologically ascending (oldest first)
      uniqueRemarks.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const wasRepaired = (rec.remarkHistory || []).length !== uniqueRemarks.length;
      if (wasRepaired) {
        repairedCount++;
      }

      return {
        ...rec,
        remarkHistory: uniqueRemarks
      };
    });

    console.log(`🛠️ Repaired remarks history for ${repairedCount} records.`);

    // 3. Save repaired records to local PG database
    await localPool.query(
      `INSERT INTO app_state (state_key, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (state_key)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      ['records', JSON.stringify(repairedRecords)]
    );
    console.log('✓ Successfully saved repaired records in local PG database.');

    // 4. Save repaired records to Supabase if configured
    if (supabase) {
      console.log('☁️ Pushing repaired records to Supabase...');
      const { error } = await supabase
        .from('app_state')
        .upsert({
          state_key: 'records',
          payload: repairedRecords,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('✗ Supabase state update failed:', error.message);
      } else {
        console.log('✓ Successfully saved repaired records in Supabase.');
      }
    } else {
      console.log('ℹ️ Supabase not configured. Skipping remote push.');
    }

  } catch (err) {
    console.error('✗ Remarks History recovery failed with error:', err.message);
  } finally {
    await localPool.end();
  }
}

run().catch(console.error);
