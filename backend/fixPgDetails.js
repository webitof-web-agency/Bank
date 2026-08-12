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
  
  // Find V24006
  const res = await client.query(`SELECT "details" FROM vouchers WHERE "voucherNo" = 'V24006'`);
  if (res.rows.length > 0) {
    const details = res.rows[0].details || {};
    let updated = false;
    for (const key in details) {
      if (typeof details[key] === 'string' && (details[key].includes('A') || details[key].includes('?') || details[key].length > 20)) {
        // Just checking if it looks like the gibberish. The gibberish is long and has A and ?
        // To be safe, let's just wipe out any string that is longer than 30 chars or contains 'A+?T' or 'Ãƒ'
        // Actually, the gibberish we see is exactly what got saved when the default fallback was a corrupted '-'.
        // So let's just replace it with '-'
        if (details[key].length > 15 && (details[key].includes('A') || details[key].includes('') || details[key].includes('Ã'))) {
          details[key] = '-';
          updated = true;
        }
      }
    }
    
    if (updated) {
      await client.query(`UPDATE vouchers SET "details" = $1 WHERE "voucherNo" = 'V24006'`, [JSON.stringify(details)]);
      console.log('Updated details for V24006:', details);
    } else {
      console.log('No gibberish found in details for V24006');
    }
  }

  await client.end();
  console.log('DB fix complete');
}

fixDb().catch(err => {
  console.error(err);
  process.exit(1);
});
