import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { ensureSchema } from './utils/schema.js';
import { getDatabaseStatus, query } from './utils/database.js';
import { findUserByEmail, createUser, getAllUsers } from './utils/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'collection-risk-postgres-secret-2026';

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(morgan('dev'));

// Auth Middlewares
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Authentication required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

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

// Auth Routes
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/auth/create-user', authenticateToken, requireAdmin, async (req, res) => {
  const { email, password, role = 'manager' } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const newUser = await createUser({ email, password, role });
    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/auth/users', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
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

if (process.env.NODE_ENV !== 'production' || process.env.VERCEL) {
  ensureSchema()
    .then(() => {
      if (!process.env.VERCEL) {
        app.listen(PORT, () => {
          console.log(`Collection Risk backend running on ${PORT}`);
        });
      }
    })
    .catch((error) => {
      console.error('Backend startup failed:', error.message);
      if (!process.env.VERCEL) process.exit(1);
    });
}

export default app;
