const Settings = require('../models/settings.model');
const { DEFAULT_SETTINGS } = require('../config/defaultSettings');
const encryption = require('../utils/encryption');

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function mergeDeep(target = {}, source = {}) {
  const result = Array.isArray(target) ? [...target] : { ...target };
  Object.entries(source || {}).forEach(([key, value]) => {
    if (UNSAFE_KEYS.has(key)) return;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeDeep(target[key] || {}, value);
    } else {
      result[key] = value;
    }
  });
  return result;
}

async function getSettings() {
  const record = await Settings.findOne({ key: 'default' }).lean();
  return record || { ...DEFAULT_SETTINGS };
}

// Settings as sent to the browser: the SMTP password never leaves the
// server, only whether one is saved.
function toClientSettings(settings = {}) {
  if (!settings || !settings.smtp) return settings;
  const { password, ...smtp } = settings.smtp;
  return { ...settings, smtp: { ...smtp, password: '', passwordSet: Boolean(password) } };
}

// The SMTP password in a saved settings document, readable.
function readSmtpPassword(smtp = {}) {
  return smtp?.password ? String(encryption.decrypt(smtp.password) || '') : '';
}

async function updateSettings(patch = {}) {
  const current = await getSettings();
  patch = { ...(patch || {}) };
  if (patch.smtp && typeof patch.smtp === 'object') {
    // An empty password keeps the saved one (the form never receives it);
    // a new one is stored encrypted when SETTINGS_ENCRYPTION_KEY is set.
    const { password, passwordSet, ...smtp } = patch.smtp;
    const typed = String(password || '').trim();
    if (typed) smtp.password = process.env.SETTINGS_ENCRYPTION_KEY ? encryption.encrypt(typed) : typed;
    patch.smtp = smtp;
  }
  const next = mergeDeep(current, patch);

  const { _id, key, createdAt, updatedAt, __v, ...updateData } = next;

  await Settings.updateOne(
    { key: 'default' },
    {
      $setOnInsert: {
        key: 'default'
      },
      $set: updateData
    },
    { upsert: true }
  );

  return getSettings();
}

module.exports = {
  getSettings,
  mergeDeep,
  readSmtpPassword,
  toClientSettings,
  updateSettings
};
