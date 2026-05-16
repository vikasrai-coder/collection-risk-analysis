import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import { ensureSchema } from './utils/schema.js';
import { getDatabaseStatus, query } from './utils/database.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(morgan('dev'));

app.get('/health', async (_req, res) => {
  try {
    await query('SELECT NOW()');
    res.json({
      status: 'OK',
      database: getDatabaseStatus(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: error.message,
    });
  }
});

app.get('/api/state', async (_req, res) => {
  try {
    const result = await query(
      'SELECT state_key, payload, updated_at FROM app_state WHERE state_key IN ($1, $2)',
      ['records', 'history'],
    );

    const payload = {
      records: [],
      history: [],
      updatedAt: null,
    };

    for (const row of result.rows) {
      if (row.state_key === 'records') payload.records = row.payload || [];
      if (row.state_key === 'history') payload.history = row.payload || [];
      if (!payload.updatedAt || row.updated_at > payload.updatedAt) {
        payload.updatedAt = row.updated_at;
      }
    }

    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/state', async (req, res) => {
  const { records = [], history = [] } = req.body || {};

  try {
    await query(
      `
      INSERT INTO app_state (state_key, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (state_key)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `,
      ['records', JSON.stringify(records)],
    );

    await query(
      `
      INSERT INTO app_state (state_key, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (state_key)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `,
      ['history', JSON.stringify(history)],
    );

    res.json({
      ok: true,
      database: getDatabaseStatus(),
      recordCount: Array.isArray(records) ? records.length : 0,
      historyCount: Array.isArray(history) ? history.length : 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Collection Risk backend running on ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Backend startup failed:', error.message);
    process.exit(1);
  });
