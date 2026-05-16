import dotenv from 'dotenv';
import { getDedicatedPools } from '../src/utils/database.js';

dotenv.config();

async function run() {
  const { primaryPool, fallbackPool } = await getDedicatedPools();

  if (!fallbackPool) {
    throw new Error('Missing FALLBACK_DATABASE_URL or SUPABASE_DATABASE_URL');
  }

  await primaryPool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await fallbackPool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const localRows = await primaryPool.query(
    'SELECT state_key, payload, updated_at FROM app_state',
  );

  for (const row of localRows.rows) {
    await fallbackPool.query(
      `
      INSERT INTO app_state (state_key, payload, updated_at)
      VALUES ($1, $2::jsonb, $3)
      ON CONFLICT (state_key)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
      `,
      [row.state_key, JSON.stringify(row.payload), row.updated_at],
    );
  }

  console.log(`Migrated ${localRows.rows.length} state rows to fallback database.`);
  await primaryPool.end();
  await fallbackPool.end();
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
