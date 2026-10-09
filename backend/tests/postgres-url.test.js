// The backend connects through a single DATABASE_URL link as well as the
// separate PG_* settings. Uses its own database (bank_test_db_url) on the
// local server.
const LINK = process.env.DB_URL_TEST_LINK || 'postgresql://postgres:postgres@127.0.0.1:5432/bank_test_db_url';
delete process.env.PG_DATABASE;
process.env.DATABASE_URL = LINK;

const test = require('node:test');
const assert = require('node:assert/strict');
const postgres = require('../config/postgres');

test('the link is parsed: host, port, user, encoded password, database, sslmode', () => {
  const saved = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = 'postgresql://bank%40app:p%40ss%3Aw%2Frd@db.example.com:6543/bank_prod?sslmode=require';
    assert.deepEqual(postgres.getDatabaseUrl(), {
      host: 'db.example.com', port: 6543, user: 'bank@app', password: 'p@ss:w/rd', database: 'bank_prod',
      sslMode: 'require', ssl: { rejectUnauthorized: false }
    });
    process.env.DATABASE_URL = 'postgres://u:p@h/d?sslmode=verify-full';
    assert.deepEqual(postgres.getDatabaseUrl().ssl, { rejectUnauthorized: true });
    assert.equal(postgres.getDatabaseUrl().port, 5432);
    process.env.DATABASE_URL = 'postgresql://u:p@h/d';
    assert.equal(postgres.getDatabaseUrl().ssl, null);
    process.env.DATABASE_URL = 'mysql://u:p@h/d';
    assert.throws(() => postgres.getDatabaseUrl(), /postgresql:\/\//);
  } finally {
    process.env.DATABASE_URL = saved;
  }
});

test('connects through the link (creating its database when missing) and the backup uses it too', async () => {
  const db = await postgres.initializeDatabase();
  try {
    const { rows } = await db.query('SELECT current_database() AS name');
    assert.equal(rows[0].name, 'bank_test_db_url');
    const dump = postgres.getDumpConnection();
    assert.deepEqual([dump.host, dump.port, dump.user, dump.database, dump.ssl], ['127.0.0.1', 5432, 'postgres', 'bank_test_db_url', false]);
  } finally {
    await postgres.closeDatabase();
  }
});
