const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { ensureDatabase } = require('../config/initDb');
const { closeMongo } = require('../config/mongo');

async function main() {
  try {
    const result = await ensureDatabase();
    console.log('Database seeded successfully.');

    if (result?.roles?.length) {
      console.log(`Seeded roles: ${result.roles.join(', ')}`);
    }

    if (Array.isArray(result?.users) && result.users.length) {
      console.log('Seeded login accounts:');
      for (const user of result.users) {
        const roleText = Array.isArray(user.roleCodes) && user.roleCodes.length ? user.roleCodes.join(', ') : '-';
        console.log(`- ${user.fullName} | ${user.email} | username: ${user.username} | roles: ${roleText} | password: ${user.password}`);
      }
    }
  } finally {
    await closeMongo().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
