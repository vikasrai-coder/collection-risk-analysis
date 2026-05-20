/**
 * archive_stale_records.js
 * ──────────────────────────────────────────────────────────────
 * One-time cleanup: marks active records that are NOT present in
 * the provided daily-upload CSV as "Payment Done" / "Closed".
 *
 * Usage:
 *   node backend/scripts/archive_stale_records.js --csv /path/to/daily.csv
 *   node backend/scripts/archive_stale_records.js --csv /path/to/daily.csv --dry-run
 *
 * Without --csv it will archive ALL currently active records
 * (use only if you want a full reset after confirming payments).
 * ──────────────────────────────────────────────────────────────
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

// ── Allowed lenders (must match frontend lenderWhitelist) ─────
const ALLOWED_LENDERS = ['cashe', 'stashfin', 'zype', 'kreditbee', 'prefr', 'lendingkart'];

// ── Helpers ───────────────────────────────────────────────────
function normalizedText(v) {
  return String(v || '').trim().replace(/\s+/g, ' ');
}

function getBaseLoanId(loanId) {
  if (!loanId) return '';
  const parts = String(loanId).split('-');
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`.trim();
  return String(loanId).trim();
}

function valueFromRow(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return String(row[k]);
    const foundKey = Object.keys(row).find(rk => rk.toLowerCase() === k.toLowerCase());
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && row[foundKey] !== '') {
      return String(row[foundKey]);
    }
  }
  return '';
}

function makeLoanKey(row) {
  const direct = valueFromRow(row, ['loanId', 'loan_id']);
  if (direct) return getBaseLoanId(direct);

  const fallbacks = [
    valueFromRow(row, ['invoiceId', 'invoice_id']),
    valueFromRow(row, ['invoiceNumber', 'invoice_number']),
    valueFromRow(row, ['referenceId', 'reference_id']),
    valueFromRow(row, ['utr', 'txnRef', 'txn_ref']),
    valueFromRow(row, ['uuid']),
  ].filter(Boolean);

  if (fallbacks.length) return getBaseLoanId(fallbacks.join('-'));

  const userId = valueFromRow(row, ['userId', 'user_id', 'customer_id', 'customerId']);
  const date   = valueFromRow(row, ['collectionDate', 'date', 'transactionDate', 'collectionDateStr']);
  const instalmentNo = valueFromRow(row, ['instalmentNo', 'installmentNo']);
  return getBaseLoanId([userId, date, instalmentNo].filter(Boolean).join('-'));
}

function isAllowedLender(lender) {
  if (!lender) return true; // no lender = don't filter out
  return ALLOWED_LENDERS.includes(normalizedText(lender).toLowerCase());
}

function isAlreadyResolved(rec) {
  return (
    rec.callStatus === 'Payment Done' ||
    rec.status    === 'Closed'        ||
    rec.status    === 'Payment Clear'
  );
}

// ── Parse CSV using readline (no extra deps) ──────────────────
async function parseCsvFile(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    let headers = null;

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      // Very simple CSV split – handles comma-separated with no embedded commas
      // For production use Papa.parse; this is fine for typical collection sheets
      const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (!headers) {
        headers = cells;
      } else {
        const row = {};
        headers.forEach((h, i) => { row[h] = cells[i] || ''; });
        results.push(row);
      }
    });

    rl.on('close', () => resolve(results));
    rl.on('error', reject);
  });
}

// ── Main ──────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const csvIdx  = args.indexOf('--csv');
const csvPath = csvIdx >= 0 ? args[csvIdx + 1] : null;
const dryRun  = args.includes('--dry-run');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     archive_stale_records.js             ║');
  console.log('╚══════════════════════════════════════════╝');

  if (dryRun) console.log('⚠️  DRY-RUN mode — no changes will be written\n');

  // 1. Load records from Supabase ────────────────────────────
  console.log('📡 Fetching records from Supabase...');
  const { data, error } = await supabase
    .from('app_state')
    .select('payload')
    .eq('state_key', 'records')
    .single();

  if (error) { console.error('❌ Supabase fetch failed:', error.message); process.exit(1); }

  const records = data?.payload || [];
  const alreadyResolved = records.filter(isAlreadyResolved).length;
  const activeCount     = records.length - alreadyResolved;
  console.log(`✅ Total records in DB : ${records.length}`);
  console.log(`   Already resolved    : ${alreadyResolved}`);
  console.log(`   Active (need review): ${activeCount}\n`);

  // 2. Build uploadedLoanIds from CSV (if provided) ──────────
  const uploadedLoanIds = new Set();

  if (csvPath) {
    if (!fs.existsSync(csvPath)) {
      console.error(`❌ CSV file not found: ${csvPath}`);
      process.exit(1);
    }
    console.log(`📄 Reading CSV: ${path.basename(csvPath)}`);
    const rows = await parseCsvFile(csvPath);
    let validRows = 0;

    for (const row of rows) {
      const userId = valueFromRow(row, ['userId', 'user_id', 'customer_id', 'customerId']);
      const lender = normalizedText(valueFromRow(row, ['lender', 'lenderName', 'nbfc']));
      if (!userId || !isAllowedLender(lender)) continue;
      const loanId = makeLoanKey(row);
      if (loanId) uploadedLoanIds.add(loanId);
      validRows++;
    }
    console.log(`   Valid rows in CSV   : ${validRows}`);
    console.log(`   Unique loanIds seen : ${uploadedLoanIds.size}\n`);
  } else {
    console.log('ℹ️  No --csv provided. Will list ALL active records.\n');
  }

  // 3. Find stale records ─────────────────────────────────────
  const toArchive = [];

  for (const rec of records) {
    if (isAlreadyResolved(rec)) continue; // already done

    if (uploadedLoanIds.size > 0) {
      const key = getBaseLoanId(rec.loanId) || rec.id;
      if (uploadedLoanIds.has(key)) continue; // still in today's sheet
    }

    toArchive.push(rec);
  }

  console.log(`🔍 Records to archive: ${toArchive.length}`);

  if (toArchive.length === 0) {
    console.log('\n✅ Nothing to archive. DB is clean!');
    return;
  }

  // 4. Print per-customer summary ────────────────────────────
  const byCustomer = {};
  for (const rec of toArchive) {
    const key = `${rec.customerName || 'Unknown'} (${rec.userId || '?'})`;
    byCustomer[key] = (byCustomer[key] || 0) + 1;
  }
  console.log('\n📋 Customers to be archived:');
  const sorted = Object.entries(byCustomer).sort((a, b) => b[1] - a[1]);
  for (const [customer, count] of sorted) {
    console.log(`   ${count.toString().padStart(3)}  ${customer}`);
  }

  if (dryRun || !csvPath) {
    console.log('\n⚠️  Nothing written (dry-run or no CSV provided).');
    console.log('   To apply: node backend/scripts/archive_stale_records.js --csv /path/to/daily.csv');
    return;
  }

  // 5. Apply changes to Supabase ─────────────────────────────
  console.log('\n✏️  Writing changes to Supabase...');
  const archiveTimestamp = new Date().toISOString();
  const archiveSet = new Set(toArchive.map(r => r.id));

  const updatedRecords = records.map(rec => {
    if (!archiveSet.has(rec.id)) return rec;
    return {
      ...rec,
      callStatus     : 'Payment Done',
      status         : 'Closed',
      remark         : rec.remark
        ? `${rec.remark} | Auto-Archived: not in daily upload`
        : 'Payment Done (Auto-Archived)',
      followUpDate   : '',
      followUpTime   : '',
      reminderEnabled: false,
      updatedAt      : archiveTimestamp,
    };
  });

  const { error: saveError } = await supabase
    .from('app_state')
    .upsert({
      state_key : 'records',
      payload   : updatedRecords,
      updated_at: archiveTimestamp,
    });

  if (saveError) {
    console.error('❌ Supabase save failed:', saveError.message);
    process.exit(1);
  }

  console.log(`\n✅ SUCCESS: ${toArchive.length} records archived as "Payment Done" / "Closed".`);
  console.log('   ✓ Preserved in DB (history intact)');
  console.log('   ✓ Will no longer appear in Daily Follow-up list');
  console.log('   ✓ Can be viewed in Records page under "Payment Done" filter');
}

run().catch(err => {
  console.error('\nFatal error:', err.message || err);
  process.exit(1);
});
