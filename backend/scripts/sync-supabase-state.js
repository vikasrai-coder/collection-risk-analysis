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

async function sync() {
  console.log('🔄 Synchronizing real connected data to Supabase app_state...');

  // 1. Get the 414 records from local PostgreSQL app_state
  const localRes = await localPool.query("SELECT payload FROM app_state WHERE state_key = 'records'");
  const localRecords = localRes.rows[0]?.payload || [];
  console.log(`📡 Loaded ${localRecords.length} records from local PostgreSQL.`);

  if (localRecords.length === 0) {
    console.error('❌ No records found in local PostgreSQL app_state. Aborting.');
    await localPool.end();
    return;
  }

  // 2. Get interaction logs from Supabase
  const { data: logsRow, error: logErr } = await supabase
    .from('app_state')
    .select('payload')
    .eq('state_key', 'interaction_logs')
    .single();

  if (logErr) {
    console.warn('⚠️ Could not fetch Supabase interaction_logs:', logErr.message);
  }
  const supaLogs = logsRow?.payload || [];
  console.log(`📋 Fetched ${supaLogs.length} interaction logs from Supabase.`);

  // Group logs by loanId
  const logsByLoan = new Map();
  for (const log of supaLogs) {
    if (!log.loanId) continue;
    if (!logsByLoan.has(log.loanId)) {
      logsByLoan.set(log.loanId, []);
    }
    logsByLoan.get(log.loanId).push(log);
  }

  // Sort logs for each loan chronologically
  for (const list of logsByLoan.values()) {
    list.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
  }

  // 3. Merge local records with latest Supabase interaction logs
  let enrichedCount = 0;
  const mergedRecords = localRecords.map(rec => {
    // Exclude any seed dummy records
    if (String(rec.id).startsWith('seed-') || rec.customerName === 'Aarav Retail') {
      return null;
    }

    const loanLogs = logsByLoan.get(rec.loanId) || [];
    if (loanLogs.length === 0) return rec;

    const latestLog = loanLogs[loanLogs.length - 1];

    const existingHistory = rec.remarkHistory || [];
    const logEntries = loanLogs.map(l => ({
      id: l.id,
      text: l.remark || '',
      timestamp: l.updatedAt,
      addedBy: l.updatedBy || 'Agent',
      invoiceNumber: l.invoiceNumber,
      partialPaymentAmount: l.partialPaymentAmount,
      remainingAmount: l.remainingAmount
    })).filter(e => e.text && e.text.trim() && e.text !== 'Daily Sheet Sync');

    const allRemarks = [...existingHistory, ...logEntries];
    const uniqueRemarks = Array.from(
      new Map(
        allRemarks.map(e => [`${e.text.trim()}-${e.addedBy}-${(e.timestamp || '').slice(0, 16)}`, e])
      ).values()
    );
    uniqueRemarks.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const isNewer = !rec.updatedAt || new Date(latestLog.updatedAt).getTime() > new Date(rec.updatedAt).getTime();
    if (isNewer) {
      enrichedCount++;
      return {
        ...rec,
        callStatus: latestLog.callStatus || rec.callStatus,
        remark: latestLog.remark || rec.remark,
        followUpDate: latestLog.followUpDate || rec.followUpDate,
        followUpTime: latestLog.followUpTime || rec.followUpTime,
        updatedAt: latestLog.updatedAt,
        updatedBy: latestLog.updatedBy || rec.updatedBy,
        remarkHistory: uniqueRemarks
      };
    }

    return {
      ...rec,
      remarkHistory: uniqueRemarks
    };
  }).filter(Boolean);

  console.log(`✨ Enriched ${enrichedCount} records with newer Supabase interaction logs.`);
  console.log(`📦 Total valid records to save: ${mergedRecords.length}`);

  // 4. Save to Supabase app_state
  const now = new Date().toISOString();
  const { error: upsertErr } = await supabase
    .from('app_state')
    .upsert({
      state_key: 'records',
      payload: mergedRecords,
      updated_at: now
    }, { onConflict: 'state_key' });

  if (upsertErr) {
    console.error('❌ Failed to upsert records to Supabase:', upsertErr.message);
  } else {
    console.log('✅ Successfully synced 414 real records to Supabase app_state!');
  }

  await localPool.end();
}

sync().catch(console.error);
