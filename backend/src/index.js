import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import https from 'https';
import { ensureSchema } from './utils/schema.js';
import { getDatabaseStatus, query } from './utils/database.js';
import { findUserByEmail, createUser, getAllUsers, updateUserPassword } from './utils/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'collection-risk-postgres-secret-2026';

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(morgan('dev'));

// Helper to send Telegram message using native https
function sendTelegramMessage(botToken, chatId, text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve(body));
    });

    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

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

app.post('/api/auth/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const existing = await findUserByEmail(email);
    if (!existing) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updated = await updateUserPassword({ email, password });
    if (updated) {
      res.json({ message: 'Password updated successfully' });
    } else {
      res.status(500).json({ message: 'Failed to update password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/state', async (_req, res) => {
  try {
    const result = await query(
      'SELECT state_key, payload, updated_at FROM app_state WHERE state_key IN ($1, $2, $3, $4)',
      ['records', 'history', 'interaction_logs', 'telegram_settings'],
    );

    const payload = {
      records: [],
      history: [],
      interaction_logs: [],
      telegram_settings: { isEnabled: false, botToken: '', chatId: '', agentName: '' },
      updatedAt: null,
    };

    for (const row of result.rows) {
      if (row.state_key === 'records') payload.records = row.payload || [];
      if (row.state_key === 'history') payload.history = row.payload || [];
      if (row.state_key === 'interaction_logs') payload.interaction_logs = row.payload || [];
      if (row.state_key === 'telegram_settings') payload.telegram_settings = row.payload || payload.telegram_settings;
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
  const { records = [], history = [], interaction_logs = [], telegram_settings } = req.body || {};

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

    await query(
      `
      INSERT INTO app_state (state_key, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (state_key)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `,
      ['interaction_logs', JSON.stringify(interaction_logs)],
    );

    if (telegram_settings) {
      await query(
        `
        INSERT INTO app_state (state_key, payload, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (state_key)
        DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
        `,
        ['telegram_settings', JSON.stringify(telegram_settings)],
      );
    }

    res.json({
      ok: true,
      database: getDatabaseStatus(),
      recordCount: Array.isArray(records) ? records.length : 0,
      historyCount: Array.isArray(history) ? history.length : 0,
      interactionCount: Array.isArray(interaction_logs) ? interaction_logs.length : 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Direct Test Alert Endpoint
app.post('/api/reminders/send-test', async (req, res) => {
  const { botToken, chatId, message } = req.body || {};
  if (!botToken || !chatId) {
    return res.status(400).json({ message: 'botToken and chatId are required' });
  }

  try {
    const textMessage = message || '🔔 *Test connection successful!*\nThis is a test notification from Collection Risk Analysis Suite.';
    const response = await sendTelegramMessage(botToken, chatId, textMessage);
    res.json({ ok: true, response: JSON.parse(response) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Reminder Scheduler to check active reminders between 10 AM and 6 PM local time
async function checkAndSendTelegramReminders() {
  try {
    const result = await query(
      "SELECT payload FROM app_state WHERE state_key = 'telegram_settings'"
    );
    const settings = result.rows[0]?.payload || {};
    if (!settings.isEnabled || !settings.botToken || !settings.chatId) {
      return;
    }

    // Check time constraint: 10 AM to 6 PM (10:00 - 18:00)
    const localTime = new Date();
    const hour = localTime.getHours();
    if (hour < 10 || hour >= 18) {
      console.log(`[Telegram Scheduler] Hour ${hour} outside active operational window (10:00 - 18:00). Skipping scheduler alerts.`);
      return;
    }

    // Get active records
    const recordsResult = await query(
      "SELECT payload FROM app_state WHERE state_key = 'records'"
    );
    const records = recordsResult.rows[0]?.payload || [];

    const todayStr = new Date().toISOString().slice(0, 10);

    const pendingReminders = records.filter(r => {
      const needsApproach = r.callStatus === 'Call Back Later' || r.callStatus === 'Promise To Pay';
      const isTodayOrPast = r.followUpDate && r.followUpDate <= todayStr;
      return r.reminderEnabled && (needsApproach || isTodayOrPast) && r.callStatus !== 'Payment Done';
    });

    if (pendingReminders.length === 0) {
      return;
    }

    console.log(`[Telegram Scheduler] Found ${pendingReminders.length} pending followups. Dispatching alerts...`);

    for (const record of pendingReminders) {
      const msg = `🔔 *Collection Follow-up Alert*\n\n` +
                  `👤 *Customer*: ${record.customerName || 'N/A'}\n` +
                  `🆔 *User ID*: ${record.userId}\n` +
                  `💰 *Default Amount*: ₹${record.defaultAmount || 0}\n` +
                  `📞 *Contact*: ${record.mobile || 'N/A'}\n` +
                  `📅 *Follow-up Date*: ${record.followUpDate || 'Today'}\n` +
                  `📝 *Current Remark*: ${record.remark || 'N/A'}\n\n` +
                  `⚠️ _Please contact this customer between active operational hours (10 AM to 6 PM)._`;
      
      try {
        await sendTelegramMessage(settings.botToken, settings.chatId, msg);
        console.log(`[Telegram Scheduler] Alert sent for user: ${record.userId}`);
      } catch (err) {
        console.error(`[Telegram Scheduler] Error sending for ${record.userId}:`, err.message);
      }
    }
  } catch (error) {
    console.error('[Telegram Scheduler] Error in reminder cycle:', error.message);
  }
}

// Check every 30 minutes
setInterval(checkAndSendTelegramReminders, 30 * 60 * 1000);

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
