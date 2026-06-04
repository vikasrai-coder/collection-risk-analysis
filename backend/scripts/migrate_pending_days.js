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

function parseCollectionDate(collectionDateStr) {
  if (!collectionDateStr) return null;
  try {
    const cleanStr = String(collectionDateStr).trim();

    // Prioritize standard JS Date parsing for ISO, GMT, or alphabetic date formats
    if (/[a-zA-Z]/.test(cleanStr) || cleanStr.includes('T')) {
      const parsed = new Date(cleanStr);
      if (!isNaN(parsed.getTime())) {
        return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
      }
    }

    const numbers = cleanStr.match(/\d+/g);
    if (numbers && numbers.length >= 3) {
      let year = 0, month = 0, day = 0;
      const val0 = parseInt(numbers[0], 10);
      const val1 = parseInt(numbers[1], 10);
      const val2 = parseInt(numbers[2], 10);

      if (val0 > 1000) {
        // YYYY-MM-DD or YYYY/MM/DD
        year = val0;
        month = val1 - 1;
        day = val2;
      } else if (val2 > 1000) {
        // DD-MM-YYYY or MM-DD-YYYY or DD/MM/YYYY
        year = val2;
        if (val0 > 12) {
          day = val0;
          month = val1 - 1;
        } else if (val1 > 12) {
          day = val1;
          month = val0 - 1;
        } else {
          // Indian context: default to DD/MM/YYYY
          day = val0;
          month = val1 - 1;
        }
      } else {
        // 2-digit year
        if (val0 > 50) {
          year = 1900 + val0;
          month = val1 - 1;
          day = val2;
        } else if (val2 < 100) {
          year = 2000 + val2;
          day = val0;
          month = val1 - 1;
        }
      }

      if (year > 0 && month >= 0 && month < 12 && day > 0 && day <= 31) {
        return new Date(Date.UTC(year, month, day));
      }
    }

    const fallback = new Date(cleanStr);
    if (!isNaN(fallback.getTime())) {
      return new Date(Date.UTC(fallback.getFullYear(), fallback.getMonth(), fallback.getDate()));
    }
  } catch (e) {}
  return null;
}

function calculatePendingDays(collectionDateStr) {
  if (!collectionDateStr) return 0;
  const recordDate = parseCollectionDate(collectionDateStr);
  if (!recordDate) return 0;

  try {
    let todayYear;
    let todayMonth;
    let todayDay;

    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      });
      const parts = formatter.formatToParts(new Date());
      const y = parts.find(p => p.type === 'year')?.value;
      const m = parts.find(p => p.type === 'month')?.value;
      const d = parts.find(p => p.type === 'day')?.value;
      if (y && m && d) {
        todayYear = parseInt(y, 10);
        todayMonth = parseInt(m, 10) - 1;
        todayDay = parseInt(d, 10);
      }
    } catch (e) {
      // Fallback
    }

    if (todayYear === undefined || isNaN(todayYear) || todayMonth === undefined || isNaN(todayMonth) || todayDay === undefined || isNaN(todayDay)) {
      const d = new Date();
      todayYear = d.getFullYear();
      todayMonth = d.getMonth();
      todayDay = d.getDate();
    }

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
