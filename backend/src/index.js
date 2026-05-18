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

// Helper to send Telegram message using native https
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
    res.json({ ok: true, message: 'Telegram settings updated successfully' });
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

    // Check time constraint: 10 AM to 6 PM (10:00 - 18:00) unless forced
    const localTime = new Date();
    const hour = localTime.getHours();
    const minute = localTime.getMinutes();
    if (!force && (hour < 10 || hour >= 18)) {
      console.log(`[Telegram Scheduler] Hour ${hour} outside active operational window (10:00 - 18:00). Skipping scheduler alerts.`);
      stats.skippedDueToTime = true;
      return stats;
    }

    // Get active records
    const recordsResult = await query(
      "SELECT payload FROM app_state WHERE state_key = 'records'"
    );
    const records = recordsResult.rows[0]?.payload || [];

    // Calculate local date and current time string (e.g. "13:00")
    const todayStr = localTime.getFullYear() + '-' + 
                     String(localTime.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(localTime.getDate()).padStart(2, '0');
    const currentTimeStr = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');

    const pendingReminders = records.filter(r => {
      const needsApproach = r.callStatus === 'Call Back Later' || r.callStatus === 'Promise To Pay';
      
      const isPastDate = r.followUpDate && r.followUpDate < todayStr;
      const isTodayDate = r.followUpDate && r.followUpDate === todayStr;
      
      let isTimeEligible = true;
      if (isTodayDate && r.followUpTime) {
        isTimeEligible = currentTimeStr >= r.followUpTime;
      }
      
      const isDateOrTimeEligible = isPastDate || (isTodayDate && isTimeEligible);
      
      return r.reminderEnabled && (needsApproach || isDateOrTimeEligible) && r.callStatus !== 'Payment Done';
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
          recordsCount: 0
        };
      }
      const group = groupedReminders[r.userId];
      group.totalDefaultAmount += Number(r.defaultAmount || 0);
      group.recordsCount += 1;
      
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
      return stats;
    }

    console.log(`[Telegram Scheduler] Found ${pendingReminders.length} pending followups across ${uniqueUserIds.length} unique customers. Dispatching grouped alerts...`);

    for (const userId of uniqueUserIds) {
      const group = groupedReminders[userId];
      const invoiceCountLabel = group.recordsCount > 1 ? ` (${group.recordsCount} Invoices)` : '';
      const combinedRemark = group.remarks.length > 0 ? group.remarks.join(' | ') : 'N/A';

      const msg = `🔔 *Collection Follow-up Alert*\n\n` +
                  `👤 *Customer*: ${group.customerName}\n` +
                  `🆔 *User ID*: ${group.userId}\n` +
                  `💰 *Total Default*: ₹${group.totalDefaultAmount.toLocaleString('en-IN')}${invoiceCountLabel}\n` +
                  `📞 *Contact*: ${group.mobile || 'N/A'}\n` +
                  `📅 *Follow-up Date*: ${group.followUpDate}\n` +
                  `⏰ *Follow-up Time*: ${group.followUpTime}\n` +
                  `📝 *Remarks*: ${combinedRemark}\n\n` +
                  `⚠️ _Please contact this customer between active operational hours (10 AM to 6 PM)._`;
      
      // Build call & whatsapp inline keyboard buttons
      let replyMarkup = null;
      if (group.mobile) {
        const cleanPhone = group.mobile.replace(/\D/g, '');
        const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
        
        replyMarkup = {
          inline_keyboard: [
            [
              {
                text: "📞 Call Customer",
                url: cleanPhone.length === 10 ? `tel:+91${cleanPhone}` : `tel:${cleanPhone}`
              },
              {
                text: "💬 Chat on WhatsApp",
                url: `https://wa.me/${formattedPhone}`
              }
            ]
          ]
        };
      }

      try {
        await sendTelegramMessage(settings.botToken, settings.chatId, msg, replyMarkup);
        console.log(`[Telegram Scheduler] Grouped alert sent for user: ${group.userId}`);
        stats.dispatchedCount++;
      } catch (err) {
        console.error(`[Telegram Scheduler] Error sending for ${group.userId}:`, err.message);
        stats.errors.push({ userId: group.userId, error: err.message });
      }
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

// Check every 1 minute in background (in local environments) for high-precision alerts
setInterval(() => checkAndSendTelegramReminders(false), 1 * 60 * 1000);

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
