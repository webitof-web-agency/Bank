require('dotenv').config({ path: __dirname + '/../.env' });
const { initializeDatabase } = require('./config/postgres');
const { getNextSequenceValue } = require('./services/sequence.service');

async function testConcurrency() {
  await initializeDatabase();
  console.log('Testing concurrency on sequence generation...');
  
  // Launch 10 simultaneous requests
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(getNextSequenceValue('employees', 'code'));
  }
  
  const results = await Promise.all(promises);
  console.log('Results array:', results);
  
  // Verify uniqueness
  const unique = new Set(results);
  if (unique.size !== results.length) {
    console.error('CONCURRENCY FAILED: Duplicates detected!', results);
    process.exit(1);
  }
  
  console.log('CONCURRENCY SUCCESS: All 10 requests returned unique sequence IDs.');
  process.exit(0);
}

testConcurrency().catch(console.error);
