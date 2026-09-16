const Settings = require('../models/settings.model');
const { DEFAULT_SETTINGS } = require('./defaultSettings');
const { initializeDatabase } = require('./postgres');
const { seedBankingData } = require('../services/banking.service');
const {
  ensureDefaultRoles,
  seedBootstrapAdmin
} = require('../services/auth.service');

// Only default roles + the bootstrap admin are seeded here. Demo login users
// (rbac.js DEMO_USER_DEFINITIONS) and banking fixture rows (config/bankingSeed.js)
// are no longer seeded automatically — this DB holds real migrated legacy data
// and must not be polluted with placeholder rows on every restart.
async function ensureDatabase() {
  await initializeDatabase();
  const defaultRoles = await ensureDefaultRoles();
  const defaultSettings = { ...DEFAULT_SETTINGS };
  delete defaultSettings.key;
  await Settings.updateOne(
    { key: 'default' },
    {
      $setOnInsert: {
        key: 'default'
      },
      $set: {
        ...defaultSettings
      }
    },
    { upsert: true }
  );

  await seedBankingData();

  const bootstrapAdmin = await seedBootstrapAdmin();

  return {
    roles: defaultRoles,
    users: [bootstrapAdmin].filter(Boolean)
  };
}

module.exports = {
  ensureDatabase
};

