// One-time data fixes, run at startup before the in-memory cache is loaded
// (config/postgres.js initializeDatabase). Each runs once per database: its
// name is recorded in app_migrations. A migration only fills in data; it
// never overwrites a value someone has entered.
const MIGRATIONS = [
  {
    // The legacy import kept each member's master row in payload.raw but
    // left these columns empty, so reports (All Member List) and the Members
    // screens showed no father's name, designation, caste, PF no.... Copy
    // them from the legacy row where the column is still empty. Legacy uses
    // "0" / " " for "none" and 1900-01-01 for "no date": those stay empty.
    name: '2026-10-13-member-details-from-legacy',
    async run(db) {
      const text = (column, rawKey) => `
        UPDATE members SET "${column}" = btrim(payload->'raw'->>'${rawKey}'), "updatedAt" = now()
         WHERE coalesce(btrim("${column}"), '') = ''
           AND coalesce(btrim(payload->'raw'->>'${rawKey}'), '') NOT IN ('', '0')`;
      const date = (column, rawKey) => `
        UPDATE members SET "${column}" = (payload->'raw'->>'${rawKey}')::timestamptz, "updatedAt" = now()
         WHERE "${column}" IS NULL
           AND coalesce(payload->'raw'->>'${rawKey}', '') ~ '^\\d{4}-\\d{2}-\\d{2}'
           AND left(payload->'raw'->>'${rawKey}', 4) > '1900'`;
      const statements = [
        text('fatherOrHusbandName', 'FathersName'),
        text('designation', 'Designation'),
        text('caste', 'Caste'),
        text('category', 'Category'),
        text('pfNo', 'PFNo'),
        text('mobileNo', 'MobileNo'),
        text('address', 'Address'),
        text('suretyName1', 'SuretiesName1'),
        text('suretyName2', 'SuretiesName2'),
        date('dateOfBirth', 'DOB'),
        date('appointmentDate', 'AppointmentDate')
      ];
      const counts = {};
      for (const sql of statements) {
        const column = sql.match(/SET "(\w+)"/)[1];
        counts[column] = (await db.query(sql)).rowCount;
      }
      return counts;
    }
  },
  {
    // A branch has one name, its place ("SADAR BAZAR"). Migrated rows held
    // the place in `place` and the bank's name ("JILA SAHAKARI KENDRIYA BANK
    // MARYADIT, RAIPUR", the same on every branch, still in
    // payload.raw.BranchName) in `label`. Move the place into `label`, the
    // branch name, and drop `place`. Branches made in the app already have
    // their name in `label` and keep it.
    name: '2026-10-13-branch-name-is-place',
    async run(db) {
      const hasPlace = (await db.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'place'"
      )).rowCount > 0;
      if (!hasPlace) return { moved: 0, dropped: false };
      const moved = (await db.query(`
        UPDATE branches SET label = btrim(place), "updatedAt" = now()
         WHERE coalesce(btrim(place), '') <> ''
           AND (coalesce(btrim(label), '') = '' OR btrim(label) = btrim(payload->'raw'->>'BranchName'))`)).rowCount;
      await db.query('ALTER TABLE branches DROP COLUMN IF EXISTS place');
      return { moved, dropped: true };
    }
  },
  {
    // Category is now picked from a list (GENERAL / OBC / SC / ST); bring the
    // legacy spellings ("O.B.C", "O.B.C.", "S.C.", "S.T.") to those codes.
    name: '2026-10-13-social-category-codes',
    async run(db) {
      const result = {};
      for (const table of ['members', 'employees']) {
        const exists = (await db.query(
          "SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'category'", [table]
        )).rowCount > 0;
        if (!exists) continue;
        result[table] = (await db.query(`
          UPDATE ${table} SET category = CASE upper(regexp_replace(category, '[^A-Za-z]', '', 'g'))
              WHEN 'GEN' THEN 'GENERAL' WHEN 'GENERAL' THEN 'GENERAL'
              WHEN 'OBC' THEN 'OBC' WHEN 'SC' THEN 'SC' WHEN 'ST' THEN 'ST' END,
            "updatedAt" = now()
           WHERE upper(regexp_replace(category, '[^A-Za-z]', '', 'g')) IN ('GEN', 'GENERAL', 'OBC', 'SC', 'ST')
             AND category NOT IN ('GENERAL', 'OBC', 'SC', 'ST')`)).rowCount;
      }
      return result;
    }
  },
  {
    // The society's address was the sample address from the dev seed
    // (bankingSeed.js) and could not be edited, so every report letterhead
    // printed it. Replace it, only if still that exact sample, with the
    // address the old software printed on its letterheads
    // (Template/Reports/all member list.pdf). Editable in Society Details.
    name: '2026-10-13-society-address-from-legacy',
    async run(db) {
      const updated = (await db.query(
        `UPDATE societies SET address = $1, "updatedAt" = now() WHERE address = $2`,
        ['JILA SAHKARI KENDRIYA BANK RAIPUR COMPOUND, G.E. Road Raipur (C.G.)', 'Civil Lines, Near Collectorate, Raipur, Chhattisgarh 492001']
      )).rowCount;
      return { updated };
    }
  }
];

async function runDataMigrations(db) {
  await db.query('CREATE TABLE IF NOT EXISTS app_migrations (name varchar(120) PRIMARY KEY, "ranAt" timestamptz NOT NULL DEFAULT now(), result jsonb)');
  const done = new Set((await db.query('SELECT name FROM app_migrations')).rows.map((row) => row.name));
  for (const migration of MIGRATIONS) {
    if (done.has(migration.name)) continue;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await migration.run(client);
      await client.query('INSERT INTO app_migrations (name, result) VALUES ($1, $2)', [migration.name, JSON.stringify(result || {})]);
      await client.query('COMMIT');
      console.log(`[migration] ${migration.name}:`, JSON.stringify(result || {}));
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[migration] ${migration.name} failed:`, error.message);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = { MIGRATIONS, runDataMigrations };
