import { query } from './database.js';

export async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Auto-run bootstrap migration to add pendingDays and defaultDays to existing records if not present
  try {
    const res = await query("SELECT payload FROM app_state WHERE state_key = 'records'");
    const rawRecords = res.rows[0]?.payload;
    if (Array.isArray(rawRecords) && rawRecords.length > 0) {
      // Check if we need to migrate (e.g. if any active record is missing pendingDays)
      const needsMigration = rawRecords.some(r => 
        r.pendingDays === undefined && 
        !(r.callStatus === "Payment Done" || r.status === "Closed" || r.status === "Payment Clear")
      );
      
      if (needsMigration) {
        console.log('[Auto-Migration] Found records without pendingDays. Triggering self-healing migration...');
        
        // Inline parseCollectionDate & calculatePendingDays functions to remain self-contained
        const parseCollectionDate = (collectionDateStr) => {
          if (collectionDateStr === undefined || collectionDateStr === null || collectionDateStr === "") return null;
          try {
            const cleanStr = String(collectionDateStr).trim();
            if (!cleanStr) return null;

            if (/^\d+(\.\d+)?$/.test(cleanStr)) {
              const num = parseFloat(cleanStr);
              if (num > 1000000000000) {
                const d = new Date(num);
                if (!isNaN(d.getTime())) return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
              }
              if (num > 1000000000) {
                const d = new Date(num * 1000);
                if (!isNaN(d.getTime())) return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
              }
              if (num > 20000 && num < 70000) {
                const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                const millisPerDay = 86400000;
                const d = new Date(excelEpoch.getTime() + Math.floor(num) * millisPerDay);
                if (!isNaN(d.getTime())) return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
              }
            }

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
                year = val0;
                month = val1 - 1;
                day = val2;
              } else if (val2 > 1000) {
                year = val2;
                if (val0 > 12) {
                  day = val0;
                  month = val1 - 1;
                } else if (val1 > 12) {
                  day = val1;
                  month = val0 - 1;
                } else {
                  day = val0;
                  month = val1 - 1;
                }
              } else {
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
        };

        const calculateDays = (collectionDateStr) => {
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
        };

        const migrated = rawRecords.map(rec => {
          const isResolved =
            rec.callStatus === "Payment Done" ||
            rec.status === "Closed" ||
            rec.status === "Payment Clear";
          const d = isResolved ? 0 : calculateDays(rec.collectionDate);
          return {
            ...rec,
            pendingDays: d,
            defaultDays: d
          };
        });

        await query(
          `INSERT INTO app_state (state_key, payload, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (state_key)
           DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
          ['records', JSON.stringify(migrated)]
        );
        console.log('[Auto-Migration] Successfully migrated all database records to include pendingDays.');
      }
    }
  } catch (err) {
    console.error('[Auto-Migration] Self-healing bootstrap failed:', err.message);
  }
}
