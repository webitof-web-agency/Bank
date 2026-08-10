const Settings = require('../models/settings.model');
const { DEFAULT_SETTINGS } = require('./defaultSettings');
const { initializeDatabase } = require('./postgres');
const { seedBankingData } = require('../services/banking.service');
const {
  ensureDefaultRoles,
  ensureDemoRoles,
  seedBootstrapAdmin,
  seedDemoUsers
} = require('../services/auth.service');

async function ensureDatabase() {
  await initializeDatabase();
  const defaultRoles = await ensureDefaultRoles();
  const demoRoles = await ensureDemoRoles();
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
  const demoUsers = await seedDemoUsers();

  return {
    roles: [...defaultRoles, ...demoRoles],
    users: [bootstrapAdmin, ...demoUsers].filter(Boolean)
  };
}

module.exports = {
  ensureDatabase
};

