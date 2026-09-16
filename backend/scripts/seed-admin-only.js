const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { closeDatabase, initializeDatabase } = require('../config/postgres');
const Settings = require('../models/settings.model');
const { DEFAULT_SETTINGS } = require('../config/defaultSettings');
const { ensureDefaultRoles, seedBootstrapAdmin } = require('../services/auth.service');

async function main() {
  console.log('');
  console.log('========================================');
  console.log('   Bank System - Admin-Only Seed        ');
  console.log('========================================');
  console.log('');

  try {
    await initializeDatabase();

    console.log('Seeding default roles...');
    const roles = await ensureDefaultRoles();

    console.log('Seeding settings defaults...');
    const defaultSettings = { ...DEFAULT_SETTINGS };
    delete defaultSettings.key;
    await Settings.updateOne(
      { key: 'default' },
      { $setOnInsert: { key: 'default' }, $set: { ...defaultSettings } },
      { upsert: true }
    );

    console.log('Seeding bootstrap admin user...');
    const admin = await seedBootstrapAdmin();

    console.log('');
    console.log('Roles seeded:', roles.join(', '));
    console.log('');

    if (admin) {
      console.log('Admin login ready:');
      console.log('--------------------------------------------------');
      console.log(`  Name     : ${admin.fullName}`);
      console.log(`  Email    : ${admin.email}`);
      console.log(`  Username : ${admin.username}`);
      console.log(`  Password : ${admin.password}`);
      console.log(`  Roles    : ${admin.roleCodes.join(', ')}`);
      console.log('--------------------------------------------------');
    } else {
      console.log('(Admin user already existed or BOOTSTRAP_ADMIN_* env vars are missing)');
    }

    console.log('');
    console.log('No branch/member/employee/ledger/voucher fixtures were seeded.');
    console.log('Done!');
    console.log('');
  } catch (error) {
    console.error('\nAdmin-only seed failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

main();
