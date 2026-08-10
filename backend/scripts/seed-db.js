const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { closeDatabase } = require('../config/postgres');
const { ensureDatabase } = require('../config/initDb');

async function main() {
  console.log('');
  console.log('========================================');
  console.log('   Bank System - Database Seed Script   ');
  console.log('========================================');
  console.log('');

  try {
    console.log('Preparing local PostgreSQL database...');
    console.log('Running seed...');
    const result = await ensureDatabase();
    console.log('Seed completed successfully.\n');

    if (result?.roles?.length) {
      console.log('Roles seeded:');
      result.roles.forEach((role) => console.log(`  - ${role}`));
      console.log('');
    }

    if (Array.isArray(result?.users) && result.users.length) {
      console.log('Login accounts ready:');
      console.log('--------------------------------------------------');
      for (const user of result.users) {
        const roleText =
          Array.isArray(user.roleCodes) && user.roleCodes.length
            ? user.roleCodes.join(', ')
            : '-';
        console.log(`  Name     : ${user.fullName}`);
        console.log(`  Email    : ${user.email}`);
        console.log(`  Username : ${user.username}`);
        console.log(`  Password : ${user.password}`);
        console.log(`  Roles    : ${roleText}`);
        console.log('--------------------------------------------------');
      }
      console.log('');
    } else {
      console.log('(No new users seeded - they may already exist in DB)');
      console.log('');
      console.log('Admin login credentials (from .env):');
      console.log('--------------------------------------------------');
      console.log(`  Email    : ${process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@bank.local'}`);
      console.log(`  Username : ${process.env.BOOTSTRAP_ADMIN_USERNAME || process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@bank.local'}`);
      console.log(`  Password : ${process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Admin@12345'}`);
      console.log('  Roles    : admin');
      console.log('--------------------------------------------------');
      console.log('');
    }

    console.log('Done!');
    console.log('');
  } catch (error) {
    console.error('\nSeed failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

main();


