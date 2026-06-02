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

function calculatePendingDays(collectionDateStr) {
  if (!collectionDateStr) return 0;
  try {
    const dateStr = collectionDateStr.substring(0, 10);
    const parts = dateStr.split('-');
    if (parts.length !== 3) return 0;
    
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed month
    const day = parseInt(parts[2], 10);
    
    if (isNaN(year) || isNaN(month) || isNaN(day)) return 0;
    
    const recordDate = new Date(Date.UTC(year, month, day));
    
    const options = {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    };
    const formatter = new Intl.DateTimeFormat("en-US", options);
    const dateParts = formatter.formatToParts(new Date());
    
    const partMap = {};
    for (const part of dateParts) {
      partMap[part.type] = part.value;
    }
    
    const todayYear = parseInt(partMap.year, 10);
    const todayMonth = parseInt(partMap.month, 10) - 1;
    const todayDay = parseInt(partMap.day, 10);
    
    const todayDate = new Date(Date.UTC(todayYear, todayMonth, todayDay));
    
    const diffTime = todayDate.getTime() - recordDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays > 0 ? diffDays : 0;
  } catch (e) {
    return 0;
  }
}

export async function migrate() {
  console.log('🔄 Initiating Payment Pending Days migration...');

  try {
    // 1. Fetch from local database
    const localRes = await localPool.query("SELECT payload FROM app_state WHERE state_key = 'records'");
    const rawRecords = localRes.rows[0]?.payload || [];
    
    if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
      console.log('⚠️ No local records found to migrate.');
      await localPool.end();
      return;
    }

    console.log(`📡 Fetched ${rawRecords.length} records from local database.`);

    // 2. Perform recalculations
    const migratedRecords = rawRecords.map(rec => {
      const isResolved =
        rec.callStatus === 'Payment Done' ||
        rec.status === 'Closed' ||
        rec.status === 'Payment Clear';
      const days = isResolved ? 0 : calculatePendingDays(rec.collectionDate);
      
      return {
        ...rec,
        pendingDays: days,
        defaultDays: days
      };
    });

    // 3. Save locally
    await localPool.query(
      `INSERT INTO app_state (state_key, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (state_key)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      ['records', JSON.stringify(migratedRecords)]
    );
    console.log('✓ Successfully migrated and saved records in local PG database.');

    // 4. Save to Supabase if enabled
    if (supabase) {
      console.log('☁️ Pushing migrated records to Supabase...');
      const { error } = await supabase
        .from('app_state')
        .upsert({
          state_key: 'records',
          payload: migratedRecords,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('✗ Supabase state update failed:', error.message);
      } else {
        console.log('✓ Successfully migrated and saved records in Supabase.');
      }
    } else {
      console.log('ℹ️ Supabase not configured. Skipping remote push.');
    }

  } catch (err) {
    console.error('✗ Migration failed with error:', err.message);
  } finally {
    await localPool.end();
  }
}

// Support direct script execution
const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  migrate().catch(console.error);
}
