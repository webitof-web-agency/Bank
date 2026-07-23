const Settings = require('../models/settings.model');
const { DEFAULT_SETTINGS } = require('../config/defaultSettings');

function mergeDeep(target = {}, source = {}) {
  const result = Array.isArray(target) ? [...target] : { ...target };
  Object.entries(source || {}).forEach(([key, value]) => {
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

async function updateSettings(patch = {}) {
  const current = await getSettings();
  const next = mergeDeep(current, patch);
  
  const { _id, key, createdAt, updatedAt, __v, ...updateData } = next;

  const updated = await Settings.findOneAndUpdate(
    { key: 'default' },
    { $set: updateData, $setOnInsert: { key: 'default' } },
    { new: true, upsert: true }
  ).lean();

  return updated || next;
}

module.exports = {
  getSettings,
  mergeDeep,
  updateSettings
};
