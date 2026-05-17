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

async function restore() {
  console.log('🔄 Reconstructing app_state from tables in database...');

  // 1. Fetch collections
  const collectionsRes = await localPool.query(`
    SELECT 
      id::text,
      customer_id,
      loan_id,
      customer_name,
      lender,
      amount,
      status,
      collection_date::text,
      category,
      updated_at::text
    FROM collections
  `);
  const collections = collectionsRes.rows;
  console.log(`  Found ${collections.length} collections.`);

  // 2. Fetch customer profiles
  const profilesRes = await localPool.query(`
    SELECT customer_id, mobile, anchor_name, alternate_mobile
    FROM customer_profiles
  `);
  const profilesMap = new Map(profilesRes.rows.map(p => [p.customer_id, p]));
  console.log(`  Found ${profilesRes.rows.length} customer profiles.`);

  // 3. Fetch followups
  const followupsRes = await localPool.query(`
    SELECT customer_id, loan_id, remark, call_status, followup_date::text, is_reminder_enabled
    FROM customer_followups
  `);
  const followupsMap = new Map(followupsRes.rows.map(f => [`${f.customer_id}__${f.loan_id}`, f]));
  console.log(`  Found ${followupsRes.rows.length} followups.`);

  // 4. Fetch risk scores
  const riskRes = await localPool.query(`
    SELECT customer_id, risk_score, payment_probability
    FROM risk_scores
  `);
  const riskMap = new Map(riskRes.rows.map(r => [r.customer_id, r]));
  console.log(`  Found ${riskRes.rows.length} risk scores.`);

  // 5. Build CollectionRecords
  const records = [];
  for (const c of collections) {
    const profile = profilesMap.get(c.customer_id) || {};
    const followup = followupsMap.get(`${c.customer_id}__${c.loan_id}`) || {};
    const risk = riskMap.get(c.customer_id) || {};

    const amountNum = parseFloat(c.amount) || 0;

    records.push({
      id: c.id,
      userId: c.customer_id,
      loanId: c.loan_id,
      customerName: c.customer_name || 'Unknown',
      lender: c.lender || 'Muthoot Fincorp Limited',
      anchor: profile.anchor_name || '',
      mobile: profile.mobile || '',
      alternateNumber: profile.alternate_mobile || '',
      category: c.category || 'Standard',
      status: c.status || 'Bounced',
      loanAmount: amountNum,
      defaultAmount: amountNum, // standard default amount
      collectionDate: c.collection_date || '',
      riskScore: risk.risk_score || 50,
      paymentProbability: risk.payment_probability || 50,
      callStatus: followup.call_status || 'Pending',
      remark: followup.remark || '',
      followUpDate: followup.followup_date || '',
      reminderEnabled: followup.is_reminder_enabled ?? false,
      updatedAt: c.updated_at || new Date().toISOString()
    });
  }

  console.log(`\n🛠️  Reconstructed ${records.length} full CollectionRecord objects.`);

  if (records.length === 0) {
    console.log('  ⚠️ No collections to reconstruct state from. Aborting.');
    await localPool.end();
    return;
  }

  // 6. Save locally
  console.log('\n💾 Saving app_state records locally...');
  await localPool.query(`
    INSERT INTO app_state (state_key, payload, updated_at)
    VALUES ($1, $2::jsonb, NOW())
    ON CONFLICT (state_key)
    DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
  `, ['records', JSON.stringify(records)]);
  console.log('  ✓ Local app_state updated.');

  // 7. Save to Supabase
  console.log('\n☁️ Saving app_state records to Supabase...');
  const { error } = await supabase
    .from('app_state')
    .upsert({
      state_key: 'records',
      payload: records,
      updated_at: new Date().toISOString()
    }, { onConflict: 'state_key' });

  if (error) {
    console.error('  ✗ Supabase state update failed:', error.message);
  } else {
    console.log('  ✓ Supabase app_state updated successfully!');
  }

  await localPool.end();
}

restore().catch(console.error);
