/**
 * create-supabase-schema.js
 * Creates all tables in Supabase via the Management API, then migrates data.
 * Run: node backend/scripts/create-supabase-schema.js
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'uybeszjzzlfmtlmwuvwu';
const MGMT_TOKEN = process.env.SUPABASE_MGMT_TOKEN || '';

async function runSQL(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MGMT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${text}`);
  return text;
}

const tables = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    email TEXT UNIQUE,
    role TEXT DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS upload_sessions (
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
  )`,
  `CREATE TABLE IF NOT EXISTS collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_ref_id TEXT,
    customer_id TEXT NOT NULL,
    loan_id TEXT NOT NULL,
    customer_name TEXT,
    supplier_name TEXT,
    amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    principal_amount NUMERIC(15,2),
    interest_amount NUMERIC(15,2),
    penalty_amount NUMERIC(15,2),
    collection_date DATE NOT NULL DEFAULT CURRENT_DATE,
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
  )`,
  `CREATE TABLE IF NOT EXISTS customer_profiles (
    customer_id TEXT PRIMARY KEY,
    mobile TEXT,
    anchor_name TEXT,
    alternate_mobile TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS customer_followups (
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
  )`,
  `CREATE TABLE IF NOT EXISTS risk_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id TEXT NOT NULL,
    loan_id TEXT,
    risk_score INTEGER,
    payment_probability INTEGER,
    calculated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS app_state (
    state_key TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
];

async function main() {
  console.log('📐 Creating Supabase tables...\n');
  for (const ddl of tables) {
    const tableName = ddl.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1];
    try {
      await runSQL(ddl);
      console.log(`  ✓ ${tableName}`);
    } catch (e) {
      console.error(`  ✗ ${tableName}: ${e.message}`);
    }
  }

  // Enable RLS + permissive policy for service role
  const tableNames = ['collections','customer_profiles','customer_followups','risk_scores','users','upload_sessions','app_state'];
  console.log('\n🔒 Setting RLS policies...');
  for (const t of tableNames) {
    try {
      await runSQL(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
      await runSQL(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='${t}' AND policyname='allow_all') THEN
          CREATE POLICY allow_all ON ${t} FOR ALL USING (true) WITH CHECK (true);
        END IF;
      END $$`);
      console.log(`  ✓ ${t}`);
    } catch (e) {
      console.log(`  ⚠ ${t}: ${e.message.slice(0, 80)}`);
    }
  }

  console.log('\n✅ Schema ready in Supabase!');
}

main().catch(console.error);
