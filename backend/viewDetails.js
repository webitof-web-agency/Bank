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
  const res = await client.query(`SELECT "details" FROM vouchers WHERE "voucherNo" = 'V24006'`);
  const details = res.rows[0].details;
  let updated = false;
  for (const key in details) {
    console.log(key, '-> length:', String(details[key]).length, '-> val:', details[key]);
    if (String(details[key]).length > 10) {
      details[key] = '';
      updated = true;
    }
  }
  
  if (updated) {
    await client.query(`UPDATE vouchers SET "details" = $1 WHERE "voucherNo" = 'V24006'`, [JSON.stringify(details)]);
    console.log('Fixed lengths!');
  }
  await client.end();
}

fixDb().catch(console.error);
