const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { Client } = require('pg');

async function getEmbeddedConnection() {
  const os = require('os');
  const fs = require('fs/promises');
  const { spawn } = require('child_process');

  const shouldUseEmbedded = String(process.env.PG_EMBEDDED || 'true').trim().toLowerCase() !== 'false';
  if (!shouldUseEmbedded) return null;

  // Since embedded server is managed by the app, we can just connect normally if it's already running.
  // But wait, it might not be running!
  // It's safer to just let `postgres.js` handle it by initializing and then we drop the schema.
  return null;
}

const { initializeDatabase, closeDatabase } = require('../config/postgres');
const { TABLES } = require('../config/sqlSchema');

async function main() {
  console.log('Resetting Database...');
  try {
    const pool = await initializeDatabase();
    
    // We drop all tables defined in TABLES to completely reset data
    console.log('Dropping tables...');
    for (const table of TABLES) {
      await pool.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }

    console.log('Dropping sequences...');
    const seqRes = await pool.query(`SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'`);
    for (const row of seqRes.rows) {
      await pool.query(`DROP SEQUENCE IF EXISTS "${row.sequence_name}" CASCADE`);
    }

    console.log('Tables dropped successfully.');
  } catch (error) {
    console.error('Failed to reset database:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

main();
