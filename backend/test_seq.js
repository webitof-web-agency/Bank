require('dotenv').config({ path: __dirname + '/../.env' });
const { initializeDatabase } = require('./config/postgres');
const { getNextSequenceValue } = require('./services/sequence.service');

async function test() {
  await initializeDatabase();
  console.log('Testing getNextSequenceValue:');
  const empCode1 = await getNextSequenceValue('employees', 'code');
  const empCode2 = await getNextSequenceValue('employees', 'code');
  console.log('Employee Code 1:', empCode1);
  console.log('Employee Code 2:', empCode2);
  
  const voucherNo = await getNextSequenceValue('vouchers', 'voucherNo');
  console.log('Voucher No:', voucherNo);
  process.exit(0);
}

test().catch(console.error);
