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

function getBaseLoanId(loanId) {
  if (!loanId) return '';
  const parts = loanId.split('-');
  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1]}`.trim();
  }
  return loanId.trim();
}

async function deduplicate() {
  console.log('🔄 Starting database deduplication by base Loan ID...');

  // 1. Fetch current app_state records
  const recordsRes = await localPool.query("SELECT payload FROM app_state WHERE state_key = 'records'");
  if (recordsRes.rows.length === 0) {
    console.log('  ⚠️ No records found in app_state. Aborting.');
    await localPool.end();
    return;
  }

  let records = recordsRes.rows[0].payload;
  if (typeof records === 'string') records = JSON.parse(records);

  if (!Array.isArray(records)) {
    console.log('  ⚠️ Records is not an array. Aborting.');
    await localPool.end();
    return;
  }

  console.log(`  Initial records count: ${records.length}`);

  // Group and merge records by base loan ID
  const mergedRecordsMap = new Map();

  for (const rec of records) {
    const baseLoanId = getBaseLoanId(rec.loanId);
    const key = `${rec.userId}__${baseLoanId}`;

    const existing = mergedRecordsMap.get(key);
    if (existing) {
      // Merge: keep standard loanId format (without suffixes)
      if (baseLoanId.length < existing.loanId.length) {
        existing.loanId = baseLoanId;
      }
      // Keep maximum of amounts since they are duplicate entries of the same loan
      existing.loanAmount = Math.max(existing.loanAmount, rec.loanAmount);
      existing.defaultAmount = Math.max(existing.defaultAmount, rec.defaultAmount);
      
      // Keep active call details/remarks if the duplicate has them filled
      if (rec.remark && (!existing.remark || existing.remark === '')) {
        existing.remark = rec.remark;
      }
      if (rec.callStatus && rec.callStatus !== 'Pending' && existing.callStatus === 'Pending') {
        existing.callStatus = rec.callStatus;
      }
      if (rec.followUpDate && !existing.followUpDate) {
        existing.followUpDate = rec.followUpDate;
      }
      if (rec.updatedAt > existing.updatedAt) {
        existing.updatedAt = rec.updatedAt;
      }
    } else {
      // Create clone and normalize its loanId
      const cloned = { ...rec, loanId: baseLoanId };
      mergedRecordsMap.set(key, cloned);
    }
  }

  const cleanRecords = Array.from(mergedRecordsMap.values());
  console.log(`  Cleaned records count: ${cleanRecords.length}`);

  // Save clean records back to PG and Supabase app_state
  await localPool.query("UPDATE app_state SET payload = $1::jsonb, updated_at = NOW() WHERE state_key = 'records'", [JSON.stringify(cleanRecords)]);
  await supabase.from('app_state').upsert({ state_key: 'records', payload: cleanRecords, updated_at: new Date().toISOString() });
  console.log('  ✓ Updated clean records in local PostgreSQL and Supabase.');

  // 2. Clean up collections relational table
  console.log('\n🧹 Cleaning up relational collections table...');
  const collectionsRes = await localPool.query("SELECT id, customer_id, loan_id, amount, collection_date FROM collections");
  const collections = collectionsRes.rows;
  console.log(`  Found ${collections.length} raw collection rows.`);

  const collectionsMap = new Map();
  const duplicateIdsToDelete = [];

  for (const col of collections) {
    const baseLoanId = getBaseLoanId(col.loan_id);
    const key = `${col.customer_id}__${baseLoanId}__${col.collection_date}`;

    if (collectionsMap.has(key)) {
      duplicateIdsToDelete.push(col.id);
    } else {
      collectionsMap.set(key, col.id);
      // Update its loan_id to standard base loan_id
      if (col.loan_id !== baseLoanId) {
        await localPool.query("UPDATE collections SET loan_id = $1, updated_at = NOW() WHERE id = $2", [baseLoanId, col.id]);
      }
    }
  }

  if (duplicateIdsToDelete.length > 0) {
    console.log(`  Deleting ${duplicateIdsToDelete.length} duplicate rows from collections table...`);
    await localPool.query("DELETE FROM collections WHERE id = ANY($1)", [duplicateIdsToDelete]);
    console.log('  ✓ Duplicate rows deleted.');
  } else {
    console.log('  ✓ No duplicate collection rows found in relational table.');
  }

  console.log('\n✨ Deduplication completed successfully! All entities are now perfectly matched and unique.');
  await localPool.end();
}

deduplicate().catch(console.error);
