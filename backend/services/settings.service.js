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
  updateSettings
};
