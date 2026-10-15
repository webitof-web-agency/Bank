// One-time data fixes, run at startup before the in-memory cache is loaded
// (config/postgres.js initializeDatabase). Each runs once per database: its
// name is recorded in app_migrations. A migration only fills in data; it
// never overwrites a value someone has entered.
const rateHistory = require('../../utils/rateHistory');
const dividendRates = require('../../utils/dividendRates');
const bcrypt = require('bcryptjs');
const { normalizeMobile, isValidMobile } = require('../../utils/mobile');

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
  },
  {
    // What the 2026-10-13 member fill left out, and the staff. Members: basic
    // salary and membership date from the legacy row; mobiles copied raw
    // ("9926158305, 7974479923") become +91 and the first number, as the app
    // stores them. Staff: an Employees save replaced the employee's payload,
    // legacy row included (live's three were filled from JilaSahkariDB2627
    // on 2026-10-14); where the row survives, the HR fields come from it. A
    // linked login shows its own designation, mobile and address, so those
    // are filled on it too. Empty fields only.
    name: '2026-10-14-member-salary-and-staff-details-from-legacy',
    async run(db) {
      const result = {};
      result.memberBasicSalary = (await db.query(`
        UPDATE members SET "basicSalary" = (payload->'raw'->>'BasicSalary')::numeric, "updatedAt" = now()
         WHERE "basicSalary" IS NULL
           AND coalesce(payload->'raw'->>'BasicSalary', '') ~ '^\\d+(\\.\\d+)?$'
           AND (payload->'raw'->>'BasicSalary')::numeric > 0`)).rowCount;
      result.memberMembershipDate = (await db.query(`
        UPDATE members SET "membershipDate" = (payload->'raw'->>'MembershipDate')::timestamptz, "updatedAt" = now()
         WHERE "membershipDate" IS NULL
           AND coalesce(payload->'raw'->>'MembershipDate', '') ~ '^\\d{4}-\\d{2}-\\d{2}'
           AND left(payload->'raw'->>'MembershipDate', 4) > '1900'`)).rowCount;
      result.memberMobile = (await db.query(`
        UPDATE members SET "mobileNo" = '+91' || substring(regexp_replace("mobileNo", '\\D', '', 'g') from 1 for 10), "updatedAt" = now()
         WHERE coalesce("mobileNo", '') <> '' AND left("mobileNo", 1) <> '+'
           AND length(regexp_replace("mobileNo", '\\D', '', 'g')) >= 10`)).rowCount;

      result.employees = (await db.query(`
        UPDATE employees e SET
          "fatherName" = coalesce(nullif(btrim(e."fatherName"), ''), nullif(btrim(r->>'FathersName'), '')),
          "dateOfBirth" = coalesce(e."dateOfBirth", CASE WHEN left(r->>'DOB', 4) > '1900' THEN (r->>'DOB')::timestamptz END),
          "appointmentDate" = coalesce(e."appointmentDate", CASE WHEN left(r->>'AppointmentDate', 4) > '1900' THEN (r->>'AppointmentDate')::timestamptz END),
          address = coalesce(nullif(btrim(e.address), ''), nullif(btrim(r->>'Address'), '')),
          category = coalesce(nullif(btrim(e.category), ''), CASE upper(regexp_replace(r->>'Category', '[^A-Za-z]', '', 'g'))
            WHEN 'GEN' THEN 'GENERAL' WHEN 'GENERAL' THEN 'GENERAL'
            WHEN 'OBC' THEN 'OBC' WHEN 'SC' THEN 'SC' WHEN 'ST' THEN 'ST'
            ELSE nullif(btrim(r->>'Category'), '') END),
          caste = coalesce(nullif(btrim(e.caste), ''), nullif(btrim(r->>'Caste'), '')),
          qualification = coalesce(nullif(btrim(e.qualification), ''), nullif(btrim(r->>'Qualification'), '')),
          "mobileNo" = coalesce(nullif(btrim(e."mobileNo"), ''), CASE WHEN length(regexp_replace(r->>'MobileNo', '\\D', '', 'g')) >= 10
            THEN '+91' || substring(regexp_replace(r->>'MobileNo', '\\D', '', 'g') from 1 for 10) END),
          "basicSalary" = coalesce(e."basicSalary", CASE WHEN (r->>'BasicSalary') ~ '^\\d+(\\.\\d+)?$' AND (r->>'BasicSalary')::numeric > 0
            THEN (r->>'BasicSalary')::numeric END),
          designation = coalesce(nullif(btrim(e.designation), ''), nullif(btrim(r->>'Designation'), '')),
          "updatedAt" = now()
          FROM (SELECT id, payload->'raw' AS r FROM employees) src
         WHERE src.id = e.id AND src.r IS NOT NULL AND e."deletedAt" IS NULL`)).rowCount;

      const hasEmployeeCode = (await db.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'employeeCode'"
      )).rowCount > 0;
      if (hasEmployeeCode) {
        result.employeeLogins = (await db.query(`
          UPDATE users u SET
            designation = coalesce(nullif(btrim(u.designation), ''), nullif(btrim(e.designation), '')),
            "mobileNo" = coalesce(nullif(btrim(u."mobileNo"), ''), nullif(btrim(e."mobileNo"), '')),
            address = coalesce(nullif(btrim(u.address), ''), nullif(btrim(e.address), '')),
            "updatedAt" = now()
          FROM employees e
         WHERE e.code = u."employeeCode" AND e."deletedAt" IS NULL
           AND (coalesce(btrim(u.designation), '') = '' OR coalesce(btrim(u."mobileNo"), '') = '' OR coalesce(btrim(u.address), '') = '')`)).rowCount;
      }
      return result;
    }
  },
  {
    name: '2026-10-14-member-edits-after-legacy-backup',
    async run(db) {
      // Changed in the old software after the 14-Aug-2026 backups, as its
      // later printout shows (Template/Reports/all member list.pdf): five
      // transfers and one name. Only where the row still has the backup value.
      const laterLegacyEdits = [
        ['1447', 'branchCode', '55', '60'],
        ['1671', 'branchCode', '53', '60'],
        ['847', 'branchCode', '12', '60'],
        ['1497', 'branchCode', '22', '60'],
        ['1374', 'branchCode', '73', '3'],
        ['1095', 'name', 'VISHWA JEET KUSHWAHA', 'VISHWAJEET SINGH']
      ];
      let updated = 0;
      for (const [code, column, from, to] of laterLegacyEdits) {
        updated += (await db.query(
          `UPDATE members SET "${column}" = $3, "updatedAt" = now() WHERE code = $1 AND "${column}" = $2 AND "deletedAt" IS NULL`,
          [code, from, to]
        )).rowCount;
      }
      return { updated };
    }
  },
  {
    // The dividend moved out of the dated interest rates into one declared
    // rate per FY (utils/dividendRates.js). Fill in the FYs whose dividend has
    // already been declared, from the rate history the legacy MstRateList was
    // loaded into: every FY from 2021-22 (the first legacy FY database) up to
    // the one two years before today's, since an FY's dividend is declared
    // when the next FY closes. Later FYs are left for the society to declare.
    name: '2026-10-14-dividend-rate-per-fy',
    async run(db) {
      const { rows } = await db.query("SELECT payload FROM settings WHERE key = 'default'");
      const ratesConfig = rows[0]?.payload?.ratesConfig;
      if (!ratesConfig || Array.isArray(ratesConfig.dividendByFy)) return { seeded: 0 };
      const history = rateHistory.normalizeRateHistory(ratesConfig.interestRateHistory, ratesConfig.interestRates || {});
      const lastStart = Number(dividendRates.fyOfDate(rateHistory.todayIso()).slice(0, 4)) - 2;
      const dividendByFy = [];
      for (let start = 2021; start <= lastStart; start += 1) {
        const fy = `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
        dividendByFy.push({ fy, rate: rateHistory.rateAsOf(history, 'paid', 'dividend', dividendRates.fyEndDate(fy)), note: 'From the old software', updatedAt: new Date().toISOString() });
      }
      await db.query(
        `UPDATE settings SET payload = jsonb_set(payload, '{ratesConfig,dividendByFy}', $1::jsonb), "updatedAt" = now() WHERE key = 'default'`,
        [JSON.stringify(dividendByFy)]
      );
      return { seeded: dividendByFy.length, rates: Object.fromEntries(dividendByFy.map((entry) => [entry.fy, entry.rate])) };
    }
  },
  {
    // Members sign in to the mobile app with mobile + password, and none had
    // a password yet. Start each one's password as their own 10-digit mobile
    // number (stored only as a bcrypt hash); a member without a valid mobile
    // can't sign in and is left as is. Cost 10, not the login default, so
    // ~750 hashes finish in about a minute at startup.
    name: '2026-10-15-member-app-password-is-mobile',
    async run(db) {
      const { rows } = await db.query(
        `SELECT id, "mobileNo" FROM members WHERE "deletedAt" IS NULL AND coalesce("passwordHash", '') = ''`
      );
      let set = 0;
      let noMobile = 0;
      for (const row of rows) {
        const mobile = normalizeMobile(row.mobileNo);
        if (!isValidMobile(mobile)) { noMobile += 1; continue; }
        const hash = await bcrypt.hash(mobile, 10);
        await db.query('UPDATE members SET "passwordHash" = $1, "updatedAt" = now() WHERE id = $2', [hash, row.id]);
        set += 1;
      }
      return { set, noMobile };
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
