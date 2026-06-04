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

async function run() {
  console.log('🚀 Starting Presence Simulator...');
  console.log('This script will simulate 2 other active operators (Gurudutt & Ritik) for 3 minutes.');
  console.log('Open the portal now to see their avatars, locations, and viewing customer indicators!');

  for (let i = 0; i < 18; i++) { // Run for 3 minutes (18 * 10 seconds)
    try {
      const selectRes = await localPool.query("SELECT payload FROM app_state WHERE state_key = 'active_users'");
      const existing = selectRes.rows[0]?.payload || [];

      const now = new Date();
      const threshold = 35 * 1000;
      
      // Filter out stale sessions (except our simulated ones, which we will overwrite)
      let cleanSessions = existing.filter(session => {
        if (!session || !session.lastHeartbeat) return false;
        const diff = now.getTime() - new Date(session.lastHeartbeat).getTime();
        return diff < threshold && 
               session.email !== 'gurudutt@kredmint.com' && 
               session.email !== 'ritik@kredmint.com';
      });

      // Inject simulated operator 1: Gurudutt on Dashboard
      cleanSessions.push({
        email: 'gurudutt@kredmint.com',
        role: 'manager',
        activePage: 'dashboard',
        viewingCustomerId: null,
        viewingCustomerName: null,
        lastHeartbeat: now.toISOString()
      });

      // Inject simulated operator 2: Ritik on Follow-up page, viewing Puja Hospitality
      cleanSessions.push({
        email: 'ritik@kredmint.com',
        role: 'manager',
        activePage: 'followup',
        viewingCustomerId: 'USR-59484',
        viewingCustomerName: 'PUJA HOSPITALITY',
        lastHeartbeat: now.toISOString()
      });

      // Save locally
      await localPool.query(
        `INSERT INTO app_state (state_key, payload, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (state_key)
         DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        ['active_users', JSON.stringify(cleanSessions)]
      );

      // Save to Supabase
      if (supabase) {
        await supabase
          .from('app_state')
          .upsert({
            state_key: 'active_users',
            payload: cleanSessions,
            updated_at: new Date().toISOString()
          });
      }

      console.log(`[Heartbeat ${i + 1}/18] Injected Gurudutt & Ritik into active operator registry.`);
    } catch (e) {
      console.error('Simulation error:', e.message);
    }
    
    await new Promise(resolve => setTimeout(resolve, 10000)); // sleep 10s
  }

  console.log('🛑 Simulation complete. Simulated sessions will expire in 35 seconds.');
  await localPool.end();
}

run().catch(console.error);
