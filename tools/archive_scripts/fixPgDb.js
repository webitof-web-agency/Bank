const { Client } = require('pg');

async function fixDb() {
  const client = new Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: '',
    database: 'bank_app'
  });

  await client.connect();
  console.log('Connected to PG');
  
  // Find V24006 and manually update the branchCode and fyCode to '-'
  const res = await client.query(`
    UPDATE vouchers
    SET "branchCode" = '-', "fyCode" = '-'
    WHERE "voucherNo" = 'V24006'
    RETURNING "voucherNo", "branchCode", "fyCode"
  `);
  
  console.log('Updated V24006:', res.rows);
  
  // Also fix any other gibberish vouchers
  const res2 = await client.query(`
    UPDATE vouchers
    SET "branchCode" = '-'
    WHERE "branchCode" LIKE '%A+?TA?s%' OR "branchCode" LIKE '%A%' OR length("branchCode") > 10
    RETURNING "voucherNo", "branchCode"
  `);
  
  console.log('Updated other branch gibberish:', res2.rows);

  const res3 = await client.query(`
    UPDATE vouchers
    SET "fyCode" = '-'
    WHERE "fyCode" LIKE '%A+?TA?s%' OR length("fyCode") > 10
    RETURNING "voucherNo", "fyCode"
  `);
  
  console.log('Updated other fyCode gibberish:', res3.rows);

  await client.end();
  console.log('DB fix complete');
}

fixDb().catch(err => {
  console.error(err);
  process.exit(1);
});
