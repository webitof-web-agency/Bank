// Bring a database up to this code's schema and data, the way the backend does
// on startup, without starting the server: adds missing columns
// (config/tableSchemas.js) and runs pending one-time data migrations
// (config/migrations). Nothing else (no seeding, no cache, no scheduler).
//
// The target is taken ONLY from the DATABASE_URL given on the command line
// (backend/.env is not read, so its PG_DATABASE can't redirect it):
//
//   DATABASE_URL='postgresql://user:pass@127.0.0.1:15432/dbname' node scripts/run-migrations.js           # dry run
//   DATABASE_URL='postgresql://user:pass@127.0.0.1:15432/dbname' node scripts/run-migrations.js --apply   # apply
//
// Take a pg_dump first: migrations change data and are recorded as done.
const { Pool } = require('pg');
const { TABLES, getSchemaColumns, buildAddColumnSql } = require('../config/sqlSchema');
const { MIGRATIONS, runDataMigrations } = require('../config/migrations');

async function main() {
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!/^postgres(ql)?:\/\//.test(url)) {
    console.error('Set DATABASE_URL=postgresql://user:pass@host:port/dbname on the command line.');
    process.exit(1);
  }
  const apply = process.argv.includes('--apply');
  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    const { rows: [info] } = await pool.query('SELECT current_database() AS db, inet_server_port() AS port');
    console.log(`Database: ${info.db} (port ${info.port})  mode: ${apply ? 'APPLY' : 'dry run'}`);

    // Columns this code expects that the database lacks.
    const { rows: existing } = await pool.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'"
    );
    const have = new Map();
    for (const row of existing) (have.get(row.table_name) || have.set(row.table_name, new Set()).get(row.table_name)).add(row.column_name);
    const alters = [];
    for (const table of TABLES) {
      const cols = have.get(table);
      if (!cols) continue; // a missing table is created by the backend itself
      const missing = getSchemaColumns(table).map((c) => c.name).filter((name) => !cols.has(name));
      if (missing.length) {
        console.log(`  missing columns on ${table}: ${missing.join(', ')}`);
        alters.push(buildAddColumnSql(table, missing));
      }
    }
    if (!alters.length) console.log('  no missing columns');

    await pool.query('CREATE TABLE IF NOT EXISTS app_migrations (name varchar(120) PRIMARY KEY, "ranAt" timestamptz NOT NULL DEFAULT now(), result jsonb)');
    const done = new Set((await pool.query('SELECT name FROM app_migrations')).rows.map((row) => row.name));
    const pending = MIGRATIONS.filter((m) => !done.has(m.name)).map((m) => m.name);
    console.log(pending.length ? `  pending migrations:\n    ${pending.join('\n    ')}` : '  no pending migrations');

    if (!apply) {
      console.log('\nDry run only. Re-run with --apply to make these changes.');
      return;
    }
    for (const sql of alters) await pool.query(sql);
    if (alters.length) console.log(`Added columns (${alters.length} table(s)).`);
    await runDataMigrations(pool); // logs each "[migration] name: result"
    console.log('Done.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Failed:', error.message);
  process.exit(1);
});
