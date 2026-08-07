import { query } from './database.js';
import crypto from 'crypto';

/**
 * Data Model for API Key & Token:
 * {
 *   id: string,
 *   name: string,
 *   key: string,         // Public API Key (e.g. vk_live_...)
 *   token: string,       // Bearer Secret Token (e.g. vk_sec_...)
 *   role: string,        // 'admin' | 'write' | 'read'
 *   createdBy: string,   // Email of creator
 *   createdAt: string,   // ISO timestamp
 *   lastUsedAt: string|null,
 *   expiresAt: string|null,
 *   isActive: boolean
 * }
 */

// Helper to load all API keys from DB (app_state table)
export async function getApiKeys() {
  try {
    const res = await query("SELECT payload FROM app_state WHERE state_key = $1", ['api_keys']);
    const keys = res.rows[0]?.payload;
    if (Array.isArray(keys)) {
      return keys;
    }
  } catch (err) {
    console.error('Failed to fetch api_keys from app_state:', err.message);
  }
  return [];
}

// Save API keys array to DB
async function saveApiKeys(keys) {
  try {
    await query(
      `INSERT INTO app_state (state_key, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (state_key)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      ['api_keys', JSON.stringify(keys)]
    );
    return true;
  } catch (err) {
    console.error('Failed to save api_keys to app_state:', err.message);
    return false;
  }
}

// Generate new API Key & Bearer Token
export async function createApiKey({ name, role = 'write', createdBy = 'admin', expiresAt = null }) {
  const keys = await getApiKeys();

  const randomHexKey = crypto.randomBytes(16).toString('hex');
  const randomHexSec = crypto.randomBytes(24).toString('hex');

  const newKeyObj = {
    id: `key_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    name: name || 'External Integration Key',
    key: `vk_live_${randomHexKey}`,
    token: `vk_sec_${randomHexSec}`,
    role: role || 'write',
    createdBy: createdBy || 'admin@vikas.raiexp',
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    expiresAt: expiresAt || null,
    isActive: true
  };

  keys.unshift(newKeyObj);
  await saveApiKeys(keys);
  return newKeyObj;
}

// Toggle active/inactive status
export async function toggleApiKeyStatus(id) {
  const keys = await getApiKeys();
  const index = keys.findIndex(k => k.id === id);
  if (index === -1) return null;

  keys[index].isActive = !keys[index].isActive;
  await saveApiKeys(keys);
  return keys[index];
}

// Delete / Revoke API key
export async function deleteApiKey(id) {
  const keys = await getApiKeys();
  const filtered = keys.filter(k => k.id !== id);
  if (filtered.length === keys.length) return false;

  await saveApiKeys(filtered);
  return true;
}

// Validate provided API Key or Bearer Token
export async function validateApiKeyOrToken(keyOrToken) {
  if (!keyOrToken || typeof keyOrToken !== 'string') return null;

  const cleanVal = keyOrToken.trim();
  const keys = await getApiKeys();

  const found = keys.find(
    k => (k.key === cleanVal || k.token === cleanVal) && k.isActive
  );

  if (!found) return null;

  // Check expiration if set
  if (found.expiresAt) {
    const expDate = new Date(found.expiresAt);
    if (!isNaN(expDate.getTime()) && expDate < new Date()) {
      return null; // Expired
    }
  }

  // Update lastUsedAt asynchronously
  touchApiKeyLastUsed(found.id).catch(() => {});

  return found;
}

// Asynchronously update lastUsedAt timestamp
export async function touchApiKeyLastUsed(id) {
  try {
    const keys = await getApiKeys();
    const index = keys.findIndex(k => k.id === id);
    if (index !== -1) {
      keys[index].lastUsedAt = new Date().toISOString();
      await saveApiKeys(keys);
    }
  } catch (err) {
    // Ignore error in background update
  }
}
