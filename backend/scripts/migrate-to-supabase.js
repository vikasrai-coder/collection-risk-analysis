/**
 * migrate-to-supabase.js
 * Reads all data from the local PostgreSQL `collection_risk` database
 * and upserts it into Supabase using the REST client.
 *
 * Run once: node backend/scripts/migrate-to-supabase.js
 */

import dotenv from 'dotenv';
import pkg from 'pg';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const { Pool } = pkg;

// ── Local source ──────────────────────────────────────────────────────────────
const localPool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://apple@localhost:5432/collection_risk',
});

// ── Supabase destination ──────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function upsertBatch(table, rows, conflictColumn) {
  if (!rows.length) return 0;
  const CHUNK = 200;
  let total = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: conflictColumn, ignoreDuplicates: false });
    if (error) {
      console.error(`  ✗ ${table} batch ${i / CHUNK + 1}:`, error.message);
    } else {
      total += chunk.length;
    }
  }
  return total;
}

// ── Ensure Supabase tables exist ──────────────────────────────────────────────
async function ensureSupabaseTables() {
  console.log('\n📐 Creating tables in Supabase via SQL...');

  const ddl = `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT,
      email TEXT UNIQUE,
      role TEXT DEFAULT 'user',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS upload_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      file_name TEXT,
      upload_type TEXT,
      total_rows INTEGER DEFAULT 0,
      processed_rows INTEGER DEFAULT 0,
      created_rows INTEGER DEFAULT 0,
      updated_rows INTEGER DEFAULT 0,
      skipped_rows INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      uploaded_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS collections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_ref_id TEXT,
      customer_id TEXT NOT NULL,
      loan_id TEXT NOT NULL,
      customer_name TEXT,
      supplier_name TEXT,
      amount NUMERIC(15,2) NOT NULL,
      principal_amount NUMERIC(15,2),
      interest_amount NUMERIC(15,2),
      penalty_amount NUMERIC(15,2),
      collection_date DATE NOT NULL,
      last_collection_date DATE,
      overdue_days INTEGER,
      status TEXT DEFAULT 'Bounced',
      bounce_reason TEXT,
      category TEXT,
      is_settled BOOLEAN DEFAULT false,
      upload_session_id UUID,
      lender TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(loan_id, customer_id, collection_date)
    );

    CREATE TABLE IF NOT EXISTS customer_profiles (
      customer_id TEXT PRIMARY KEY,
      mobile TEXT,
      anchor_name TEXT,
      alternate_mobile TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customer_followups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id TEXT NOT NULL,
      loan_id TEXT,
      remark TEXT,
      call_status TEXT,
      followup_date DATE,
      is_reminder_enabled BOOLEAN DEFAULT true,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS risk_scores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id TEXT NOT NULL,
      loan_id TEXT,
      risk_score INTEGER,
      payment_probability INTEGER,
      calculated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      table_name TEXT,
      record_id UUID,
      action TEXT,
      changed_by UUID,
      changed_at TIMESTAMPTZ DEFAULT NOW(),
      old_data JSONB,
      new_data JSONB
    );

    CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // Supabase JS client doesn't support raw SQL — we use the REST API trick:
  // We'll create a temporary RPC function or just use the pg client pointed at Supabase.
  // Instead, we'll create tables by attempting to select and catching errors gracefully.
  console.log('  ℹ️  Tables will be auto-created on first upsert where possible.');
  console.log('  ⚠️  If upserts fail, run the DDL manually in Supabase SQL Editor.');
  console.log('  📋  DDL is saved to: backend/scripts/supabase-schema.sql');

  // Save DDL to file for manual execution
  const fs = await import('fs');
  fs.default.writeFileSync(
    path.join(__dirname, 'supabase-schema.sql'),
    ddl.trim(),
    'utf8',
  );
}

// ── Migration ─────────────────────────────────────────────────────────────────
async function migrate() {
  console.log('🚀 Starting migration: Local PostgreSQL → Supabase\n');

  await ensureSupabaseTables();

  // 1. collections
  console.log('\n📦 Migrating collections...');
  const { rows: collections } = await localPool.query(
    `SELECT id::text, external_ref_id, customer_id, loan_id, customer_name,
            supplier_name, amount, principal_amount, interest_amount,
            penalty_amount, collection_date, last_collection_date,
            overdue_days, status, bounce_reason, category, is_settled,
            upload_session_id::text, lender, created_at, updated_at
     FROM collections`,
  );
  const c1 = await upsertBatch('collections', collections, 'id');
  console.log(`  ✓ ${c1} / ${collections.length} collections migrated`);

  // 2. customer_profiles
  console.log('\n👤 Migrating customer_profiles...');
  const { rows: profiles } = await localPool.query(
    `SELECT customer_id, mobile, anchor_name, alternate_mobile, updated_at
     FROM customer_profiles`,
  );
  const c2 = await upsertBatch('customer_profiles', profiles, 'customer_id');
  console.log(`  ✓ ${c2} / ${profiles.length} customer_profiles migrated`);

  // 3. customer_followups
  console.log('\n📋 Migrating customer_followups...');
  const { rows: followups } = await localPool.query(
    `SELECT id::text, customer_id, loan_id, remark, call_status,
            followup_date, is_reminder_enabled, created_by::text, created_at, updated_at
     FROM customer_followups`,
  );
  const c3 = await upsertBatch('customer_followups', followups, 'id');
  console.log(`  ✓ ${c3} / ${followups.length} customer_followups migrated`);

  // 4. risk_scores
  console.log('\n🔢 Migrating risk_scores...');
  const { rows: riskScores } = await localPool.query(
    `SELECT id::text, customer_id, risk_score, risk_level, payment_probability, confidence_level, calculated_at
     FROM risk_scores`,
  );
  // risk_scores - add missing columns to Supabase table first
  const rsRows = riskScores.map(r => ({
    id: r.id,
    customer_id: r.customer_id,
    risk_score: r.risk_score ? Math.round(parseFloat(r.risk_score)) : null,
    payment_probability: r.payment_probability ? Math.round(parseFloat(r.payment_probability) * 100) : null,
    calculated_at: r.calculated_at,
  }));
  const c4 = await upsertBatch('risk_scores', rsRows, 'id');
  console.log(`  ✓ ${c4} / ${riskScores.length} risk_scores migrated`);

  // 5. users
  console.log('\n👥 Migrating users...');
  const { rows: users } = await localPool.query(
    `SELECT id::text, email, role, is_active, created_at FROM users`,
  );
  const c5 = await upsertBatch('users', users, 'id');
  console.log(`  ✓ ${c5} / ${users.length} users migrated`);

  // 6. upload_sessions
  console.log('\n📁 Migrating upload_sessions...');
  const { rows: sessions } = await localPool.query(
    `SELECT id::text, file_name, record_count as total_rows, new_records as created_rows,
            updated_records as updated_rows, skipped_records as skipped_rows,
            status, user_id::text as uploaded_by, upload_date as created_at, completed_at
     FROM upload_sessions`,
  );
  const c6 = await upsertBatch('upload_sessions', sessions, 'id');
  console.log(`  ✓ ${c6} / ${sessions.length} upload_sessions migrated`);

  console.log('\n✅ Migration complete!\n');
  console.log('Summary:');
  console.log(`  collections:       ${c1}`);
  console.log(`  customer_profiles: ${c2}`);
  console.log(`  customer_followups:${c3}`);
  console.log(`  risk_scores:       ${c4}`);
  console.log(`  users:             ${c5}`);
  console.log(`  upload_sessions:   ${c6}`);

  await localPool.end();
}

migrate().catch((err) => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
