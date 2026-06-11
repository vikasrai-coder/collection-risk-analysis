import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import https from 'https';
import nodemailer from 'nodemailer';
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

// Helper to parse collectionDate in different formats robustly
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

// Helper to calculate payment pending days since collectionDate (in IST)
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


// Helper to clean up passed reminders and reset yesterday's follow-ups in IST
function cleanupAndResetStaleRecords(records) {
  if (!Array.isArray(records)) return [];

  // Get current Indian Standard Time (IST) components
  const options = {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  };
  const formatter = new Intl.DateTimeFormat("en-US", options);
  const parts = formatter.formatToParts(new Date());
  
  const partMap = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }
  
  const todayStr = `${partMap.year}-${partMap.month}-${partMap.day}`; // "YYYY-MM-DD"
  const currentTimeStr = `${partMap.hour}:${partMap.minute}`; // "HH:MM"

  return records.map(rec => {
    // Calculate pending days (only for active defaults)
    const isResolved =
      rec.callStatus === "Payment Done" ||
      rec.status === "Closed" ||
      rec.status === "Payment Clear";
    const pDays = isResolved ? 0 : calculatePendingDays(rec.collectionDate);

    // Copy record to update it
    let updatedRec = { 
      ...rec,
      pendingDays: pDays,
      defaultDays: pDays
    };

    return updatedRec;
  });
}

// Helper to send Telegram message using native https with strict error parsing
function sendTelegramMessage(botToken, chatId, text, replyMarkup = null) {
  return new Promise((resolve, reject) => {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    const data = JSON.stringify(payload);

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (res.statusCode !== 200 || !result.ok) {
            return reject(new Error(result.description || `Telegram API responded with status code ${res.statusCode}`));
          }
          resolve(result);
        } catch (err) {
          if (res.statusCode !== 200) {
            return reject(new Error(`Telegram API responded with status ${res.statusCode}: ${body}`));
          }
          resolve(body);
        }
      });
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

// Public Forgot Password Route
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ message: 'Email address is required' });
  }

  try {
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: 'No account found with this email address' });
    }

    // Generate a secure temporary password: KM-XXXXXX (6 random digits)
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const tempPassword = `KM-${randomSuffix}`;

    // Update the password in database
    const updated = await updateUserPassword({ email, password: tempPassword });
    if (!updated) {
      return res.status(500).json({ message: 'Failed to generate temporary password' });
    }

    // Create standard nodemailer transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'kredmint@gmail.com',
        pass: process.env.EMAIL_PASS || 'tqwa igoj bkjt ijrm'
      }
    });

    const consoleUrl = req.headers.origin || 'http://localhost:3001';

    // Premium HTML Email Template
    const mailOptions = {
      from: `"KredMint Security" <${process.env.EMAIL_USER || 'kredmint@gmail.com'}>`,
      to: email,
      subject: '🔒 Temporary Password - KredMint Collection Risk Console',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              background-color: #0b0f19;
              color: #f1f5f9;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background-color: #0f172a;
              border: 1px solid rgba(255, 255, 255, 0.1);
              border-radius: 24px;
              overflow: hidden;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.5);
            }
            .header {
              background: linear-gradient(135deg, #0e7490 0%, #06b6d4 100%);
              padding: 40px 20px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              color: #ffffff;
              font-size: 28px;
              font-weight: 800;
              letter-spacing: -0.025em;
            }
            .content {
              padding: 40px 30px;
            }
            .greeting {
              font-size: 18px;
              font-weight: 600;
              color: #ffffff;
              margin-bottom: 16px;
            }
            .message {
              font-size: 15px;
              line-height: 1.6;
              color: #94a3b8;
              margin-bottom: 24px;
            }
            .password-card {
              background-color: rgba(255, 255, 255, 0.03);
              border: 1px dashed rgba(6, 182, 212, 0.4);
              border-radius: 16px;
              padding: 24px;
              text-align: center;
              margin: 32px 0;
            }
            .password-label {
              font-size: 12px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              color: #06b6d4;
              margin-bottom: 8px;
            }
            .password-value {
              font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
              font-size: 32px;
              font-weight: 800;
              color: #ffffff;
              letter-spacing: 2px;
              margin: 0;
            }
            .cta-btn {
              display: inline-block;
              background-color: #06b6d4;
              color: #0f172a !important;
              text-decoration: none;
              padding: 14px 32px;
              font-size: 15px;
              font-weight: 700;
              border-radius: 12px;
              text-align: center;
              transition: background-color 0.2s;
              margin-top: 16px;
            }
            .footer {
              background-color: #090d16;
              padding: 24px 30px;
              text-align: center;
              border-top: 1px solid rgba(255, 255, 255, 0.05);
              font-size: 12px;
              color: #64748b;
              line-height: 1.5;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>KredMint Ops Console</h1>
            </div>
            <div class="content">
              <div class="greeting">Hello,</div>
              <div class="message">
                We received a request to reset the password for your account on the <strong>Collection Risk Analysis Console</strong>. 
                A new temporary password has been successfully generated for you.
              </div>
              
              <div class="password-card">
                <div class="password-label">Temporary Password</div>
                <div class="password-value">${tempPassword}</div>
              </div>
              
              <div class="message" style="margin-bottom: 32px;">
                Please sign in with this temporary password. For security reasons, we strongly recommend changing this password immediately after logging in.
              </div>
              
              <div style="text-align: center;">
                <a href="${consoleUrl}" class="cta-btn">Sign In to Console</a>
              </div>
            </div>
            <div class="footer">
              This is an automated security notification. If you did not request a password reset, please contact your administrator or secure your email account immediately.<br>
              <span style="display: inline-block; margin-top: 12px;">© 2026 KredMint Collection Risk Suite. All rights reserved.</span>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: 'Temporary password sent successfully to your email address.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: `Error sending password reset: ${error.message}` });
  }
});

app.get('/api/state', async (req, res) => {
  const { lastUpdatedAt } = req.query || {};

  try {
    // 1. Fetch only timestamps to verify if anything changed
    const tsResult = await query(
      'SELECT state_key, updated_at FROM app_state WHERE state_key IN ($1, $2, $3, $4)',
      ['records', 'history', 'interaction_logs', 'telegram_settings']
    );

    let maxUpdatedAt = null;
    for (const row of tsResult.rows) {
      if (!maxUpdatedAt || row.updated_at > maxUpdatedAt) {
        maxUpdatedAt = row.updated_at;
      }
    }

    // Check if date has rolled over in IST since records were last updated
    let dateRolledOver = false;
    const recordsRow = tsResult.rows.find(row => row.state_key === 'records');
    if (recordsRow && recordsRow.updated_at) {
      try {
        const options = {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        };
        const formatter = new Intl.DateTimeFormat("en-US", options);
        
        const todayParts = formatter.formatToParts(new Date());
        const todayMap = {};
        for (const p of todayParts) { todayMap[p.type] = p.value; }
        const todayIstStr = `${todayMap.year}-${todayMap.month}-${todayMap.day}`;

        const recParts = formatter.formatToParts(new Date(recordsRow.updated_at));
        const recMap = {};
        for (const p of recParts) { recMap[p.type] = p.value; }
        const recordsIstStr = `${recMap.year}-${recMap.month}-${recMap.day}`;

        if (todayIstStr !== recordsIstStr) {
          dateRolledOver = true;
        }
      } catch (e) {
        // Fallback to full fetch if time zone formatting fails
        dateRolledOver = true;
      }
    } else {
      // If no records row exists yet, force a full fetch
      dateRolledOver = true;
    }

    if (lastUpdatedAt && maxUpdatedAt && !dateRolledOver) {
      const clientTime = new Date(lastUpdatedAt).getTime();
      const serverTime = new Date(maxUpdatedAt).getTime();
      // Use 1000ms threshold to handle rounding/serialization differences
      if (clientTime >= serverTime || Math.abs(serverTime - clientTime) < 1000) {
        return res.json({ upToDate: true });
      }
    }

    // 2. Fetch full payload since client is out of date or date rolled over
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

    let recordsUpdated = false;
    let recordsList = [];

    for (const row of result.rows) {
      if (row.state_key === 'records') {
        const rawRecords = row.payload || [];
        recordsList = cleanupAndResetStaleRecords(rawRecords);
        if (JSON.stringify(rawRecords) !== JSON.stringify(recordsList)) {
          recordsUpdated = true;
        }
        payload.records = recordsList;
      }
      if (row.state_key === 'history') payload.history = row.payload || [];
      if (row.state_key === 'interaction_logs') payload.interaction_logs = row.payload || [];
      if (row.state_key === 'telegram_settings') payload.telegram_settings = row.payload || payload.telegram_settings;
      if (!payload.updatedAt || row.updated_at > payload.updatedAt) {
        payload.updatedAt = row.updated_at;
      }
    }

    if (recordsUpdated) {
      const updateRes = await query(
        `
        INSERT INTO app_state (state_key, payload, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (state_key)
        DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
        RETURNING updated_at
        `,
        ['records', JSON.stringify(recordsList)],
      );
      if (updateRes.rows[0]?.updated_at) {
        payload.updatedAt = updateRes.rows[0].updated_at;
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
    // 1. Fetch sent_reminders to prevent old records payload from resurrecting sent reminders
    const sentResult = await query(
      "SELECT payload FROM app_state WHERE state_key = 'sent_reminders'"
    );
    const sentReminders = sentResult.rows[0]?.payload || [];

    const finalRecords = cleanupAndResetStaleRecords(records).map(rec => {
      const key = `${rec.userId}-${rec.followUpDate || 'no-date'}-${rec.followUpTime || 'no-time'}`;
      if (sentReminders.includes(key)) {
        return { ...rec, reminderEnabled: false };
      }
      return rec;
    });

    await query(
      `
      INSERT INTO app_state (state_key, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (state_key)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `,
      ['records', JSON.stringify(finalRecords)],
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

    // 2. Fetch existing database interaction logs and merge them with client logs.
    // This prevents older agent remarks from being replaced by a stale browser payload.
    const existingLogsResult = await query(
      "SELECT payload FROM app_state WHERE state_key = 'interaction_logs'"
    );
    const existingLogs = existingLogsResult.rows[0]?.payload || [];

    const mergedLogs = [...interaction_logs];
    for (const extLog of existingLogs) {
      if (!extLog) continue;
      const alreadyExists = mergedLogs.some(log => log && log.id === extLog.id);
      if (!alreadyExists) {
        mergedLogs.push(extLog);
      }
    }

    await query(
      `
      INSERT INTO app_state (state_key, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (state_key)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `,
      ['interaction_logs', JSON.stringify(mergedLogs)],
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

    // Fetch the updated max timestamp to return to the client so it can update its lastUpdatedAtRef
    const timeRes = await query(
      "SELECT MAX(updated_at) as max_time FROM app_state WHERE state_key IN ('records', 'history', 'interaction_logs', 'telegram_settings')"
    );
    const dbNow = timeRes.rows[0]?.max_time;

    res.json({
      ok: true,
      database: getDatabaseStatus(),
      updatedAt: dbNow || new Date().toISOString(),
      recordCount: Array.isArray(records) ? records.length : 0,
      historyCount: Array.isArray(history) ? history.length : 0,
      interactionCount: Array.isArray(interaction_logs) ? interaction_logs.length : 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Dedicated fast Telegram Settings saving endpoint
app.post('/api/telegram-settings', async (req, res) => {
  const { telegram_settings } = req.body || {};
  if (!telegram_settings) {
    return res.status(400).json({ message: 'telegram_settings is required' });
  }

  try {
    await query(
      `
      INSERT INTO app_state (state_key, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (state_key)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `,
      ['telegram_settings', JSON.stringify(telegram_settings)],
    );

    const timeRes = await query(
      "SELECT updated_at FROM app_state WHERE state_key = 'telegram_settings'"
    );
    const dbNow = timeRes.rows[0]?.updated_at;

    res.json({ 
      ok: true, 
      message: 'Telegram settings updated successfully',
      updatedAt: dbNow || new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Live Operator Presence Heartbeat Route
app.post('/api/presence/heartbeat', authenticateToken, async (req, res) => {
  const { email, role } = req.user || {};
  const { activePage, viewingCustomerId, viewingCustomerName } = req.body || {};

  if (!email) {
    return res.status(400).json({ message: 'User context is missing' });
  }

  try {
    const selectRes = await query(
      "SELECT payload FROM app_state WHERE state_key = 'active_users'"
    );
    const existingSessions = selectRes.rows[0]?.payload || [];

    const now = new Date();
    const threshold = 35 * 1000;
    const cleanSessions = existingSessions.filter(session => {
      if (!session || !session.lastHeartbeat) return false;
      const diff = now.getTime() - new Date(session.lastHeartbeat).getTime();
      return diff < threshold && session.email !== email;
    });

    cleanSessions.push({
      email,
      role,
      activePage: activePage || 'dashboard',
      viewingCustomerId: viewingCustomerId || null,
      viewingCustomerName: viewingCustomerName || null,
      lastHeartbeat: now.toISOString()
    });

    await query(
      `
      INSERT INTO app_state (state_key, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (state_key)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `,
      ['active_users', JSON.stringify(cleanSessions)]
    );

    res.json({ ok: true, activeUsers: cleanSessions });
  } catch (error) {
    console.error('Presence heartbeat error:', error.message);
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
async function checkAndSendTelegramReminders(force = false) {
  const stats = {
    isEnabled: false,
    checkedCount: 0,
    dispatchedCount: 0,
    errors: [],
    skippedDueToTime: false
  };

  try {
    const result = await query(
      "SELECT payload FROM app_state WHERE state_key = 'telegram_settings'"
    );
    const settings = result.rows[0]?.payload || {};
    if (!settings.isEnabled || !settings.botToken || !settings.chatId) {
      return stats;
    }
    stats.isEnabled = true;

    // Get current Indian Standard Time (IST) components safely across all server environments
    const options = {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    };
    const formatter = new Intl.DateTimeFormat("en-US", options);
    const parts = formatter.formatToParts(new Date());
    
    const partMap = {};
    for (const part of parts) {
      partMap[part.type] = part.value;
    }
    
    const todayStr = `${partMap.year}-${partMap.month}-${partMap.day}`; // "2026-05-18"
    const currentTimeStr = `${partMap.hour}:${partMap.minute}`; // "13:10"
    const hour = Number(partMap.hour);

    // Check time constraint: 10 AM to 6 PM (10:00 - 18:00) IST unless forced
    if (!force && (hour < 10 || hour >= 18)) {
      console.log(`[Telegram Scheduler] Hour ${hour} IST outside active operational window (10:00 - 18:00). Skipping scheduler alerts.`);
      stats.skippedDueToTime = true;
      return stats;
    }

    // Get active records
    const recordsResult = await query(
      "SELECT payload FROM app_state WHERE state_key = 'records'"
    );
    const rawRecords = recordsResult.rows[0]?.payload || [];
    const records = cleanupAndResetStaleRecords(rawRecords);
    let databaseUpdateNeeded = JSON.stringify(rawRecords) !== JSON.stringify(records);

    // Get interaction logs for Activity timeline sync
    const logsResult = await query(
      "SELECT payload FROM app_state WHERE state_key = 'interaction_logs'"
    );
    const interactionLogs = logsResult.rows[0]?.payload || [];

    // Get already sent reminders to prevent duplicates from UI state overwrites
    const sentResult = await query(
      "SELECT payload FROM app_state WHERE state_key = 'sent_reminders'"
    );
    const sentReminders = sentResult.rows[0]?.payload || [];

    const pendingReminders = records.filter(r => {
      const isPastDate = r.followUpDate && r.followUpDate < todayStr;
      const isTodayDate = r.followUpDate && r.followUpDate === todayStr;
      
      let isTimeEligible = true;
      if (isTodayDate && r.followUpTime) {
        isTimeEligible = currentTimeStr >= r.followUpTime;
      }
      
      const isDateOrTimeEligible = isPastDate || (isTodayDate && isTimeEligible);
      
      // Build unique key for this reminder based on customer userId, date, and time
      const reminderKey = `${r.userId}-${r.followUpDate || 'no-date'}-${r.followUpTime || 'no-time'}`;
      const isAlreadySent = sentReminders.includes(reminderKey);
      
      return r.reminderEnabled && isDateOrTimeEligible && r.callStatus !== 'Payment Done' && !isAlreadySent;
    });

    // Group pending reminders by userId to prevent invoice-wise duplicate notifications
    const groupedReminders = {};
    for (const r of pendingReminders) {
      if (!groupedReminders[r.userId]) {
        groupedReminders[r.userId] = {
          userId: r.userId,
          customerName: r.customerName || 'N/A',
          mobile: r.mobile || '',
          followUpDate: r.followUpDate || 'Today',
          followUpTime: r.followUpTime || 'N/A',
          remarks: [],
          totalDefaultAmount: 0,
          recordsCount: 0,
          originalRecords: []
        };
      }
      const group = groupedReminders[r.userId];
      group.totalDefaultAmount += Number(r.defaultAmount || 0);
      group.recordsCount += 1;
      group.originalRecords.push(r);
      
      // Keep the earliest followUpTime
      if (r.followUpTime && r.followUpTime !== 'N/A') {
        if (group.followUpTime === 'N/A' || r.followUpTime < group.followUpTime) {
          group.followUpTime = r.followUpTime;
        }
      }
      
      // Collect unique remarks
      if (r.remark && r.remark.trim() && !group.remarks.includes(r.remark.trim())) {
        group.remarks.push(r.remark.trim());
      }
    }

    const uniqueUserIds = Object.keys(groupedReminders);
    stats.checkedCount = uniqueUserIds.length;
    if (uniqueUserIds.length === 0) {
      // If there was a database update needed from cleanup, save it even if no dispatches
      if (databaseUpdateNeeded) {
        await query(
          "INSERT INTO app_state (state_key, payload) VALUES ($1, $2) ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload",
          ['records', JSON.stringify(records)]
        );
      }
      return stats;
    }

    console.log(`[Telegram Scheduler] Found ${pendingReminders.length} pending followups across ${uniqueUserIds.length} unique customers. Dispatching grouped alerts...`);

    for (const userId of uniqueUserIds) {
      const group = groupedReminders[userId];
      const combinedRemark = group.remarks.length > 0 ? group.remarks.join(' | ') : 'N/A';

      const cleanPhone = group.mobile ? group.mobile.replace(/\D/g, '') : '';

      const msg = `*Collection Follow-up Alert*\n\n` +
                  `👤 *Customer*: ${group.customerName}\n` +
                  `🆔 *User ID*: ${group.userId}\n` +
                  `💰 *Default Amount*: ₹${group.totalDefaultAmount.toLocaleString('en-IN')} / ${group.recordsCount} ${group.recordsCount === 1 ? 'loan' : 'loans'}\n` +
                  `📞 *Contact*: ${group.mobile || 'N/A'}\n` +
                  `📅 *Follow-up Date*: ${group.followUpDate}\n` +
                  `📝 *Current Remark*: ${combinedRemark}\n\n` +
                  `⚠️ _Please contact this customer between active operational hours (10 AM to 6 PM)._`;
      
      // Build call & whatsapp inline keyboard buttons
      let replyMarkup = null;
      if (group.mobile) {
        const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
        
        replyMarkup = {
          inline_keyboard: [
            [
              {
                text: "💬 Chat on WhatsApp",
                url: `https://wa.me/${formattedPhone}`
              },
              {
                text: "💻 Kredmint Console",
                url: `https://console.kredmint.in/merchant/dashboard/?userId=${group.userId}`
              }
            ]
          ]
        };
      }

      try {
        await sendTelegramMessage(settings.botToken, settings.chatId, msg, replyMarkup);
        console.log(`[Telegram Scheduler] Grouped alert sent for user: ${group.userId}`);
        stats.dispatchedCount++;

        // Mark the records under this grouped user as processed so they don't fire again
        for (const origRec of group.originalRecords) {
          const match = records.find(rec => rec.id === origRec.id);
          if (match) {
            match.reminderEnabled = false;
            databaseUpdateNeeded = true;
          }

          // Register sent reminder in persistent list to survive stale UI state overwrites
          const reminderKey = `${origRec.userId}-${origRec.followUpDate || 'no-date'}-${origRec.followUpTime || 'no-time'}`;
          if (!sentReminders.includes(reminderKey)) {
            sentReminders.push(reminderKey);
          }

          // Append to Activity Timeline logs
          interactionLogs.push({
            id: `tele-rem-${origRec.id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            loanId: origRec.loanId,
            userId: origRec.userId,
            customerName: origRec.customerName,
            callStatus: origRec.callStatus,
            remark: `🔔 [Telegram Alert] Follow-up reminder successfully dispatched to Vikas Rai (Telegram).`,
            followUpDate: origRec.followUpDate,
            followUpTime: origRec.followUpTime || "",
            updatedAt: new Date().toISOString(),
            updatedBy: "System (Telegram Alert)"
          });
        }
      } catch (err) {
        console.error(`[Telegram Scheduler] Error sending for ${group.userId}:`, err.message);
        stats.errors.push({ userId: group.userId, error: err.message });
      }
    }

    // Save back the updated records, sent_reminders, and activity logs state if needed
    if (databaseUpdateNeeded) {
      await query(
        "INSERT INTO app_state (state_key, payload) VALUES ($1, $2) ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload",
        ['records', JSON.stringify(records)]
      );
      await query(
        "INSERT INTO app_state (state_key, payload) VALUES ($1, $2) ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload",
        ['sent_reminders', JSON.stringify(sentReminders)]
      );
      await query(
        "INSERT INTO app_state (state_key, payload) VALUES ($1, $2) ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload",
        ['interaction_logs', JSON.stringify(interactionLogs)]
      );
      console.log(`[Telegram Scheduler] Successfully updated database to clear dispatched reminders, update sent_reminders, and record activity logs.`);
    }

  } catch (error) {
    console.error('[Telegram Scheduler] Error in reminder cycle:', error.message);
    stats.errors.push({ global: error.message });
  }
  return stats;
}

// Endpoint to trigger cron check / manual trigger of reminders
app.post('/api/reminders/cron-check', async (req, res) => {
  const { force } = req.body || {};
  try {
    const stats = await checkAndSendTelegramReminders(!!force);
    res.json({ ok: true, stats });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET endpoint as well for easy vercel cron trigger
app.get('/api/reminders/cron-check', async (req, res) => {
  const force = req.query.force === 'true';
  try {
    const stats = await checkAndSendTelegramReminders(force);
    res.json({ ok: true, stats });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Check every 1 minute in background (in local environments only, not on Vercel)
if (!process.env.VERCEL) {
  setInterval(() => checkAndSendTelegramReminders(false), 1 * 60 * 1000);
}

if (!process.env.VERCEL) {
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
}

export default app;
