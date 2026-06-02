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
        
        // Inline calculatePendingDays function to remain self-contained
        const calculateDays = (collectionDateStr) => {
          if (!collectionDateStr) return 0;
          try {
            const dateStr = collectionDateStr.substring(0, 10);
            const parts = dateStr.split('-');
            if (parts.length !== 3) return 0;
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            if (isNaN(year) || isNaN(month) || isNaN(day)) return 0;
            
            const recordDate = new Date(Date.UTC(year, month, day));
            const options = { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" };
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
