const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { initializeDatabase, closeDatabase } = require('../config/postgres');
const { NoInterestMember } = require('../models/banking.models');

const dummyData = [
  {
    code: 'NI001',
    memberCode: 'MEM001',
    reason: 'Suspended account due to inactivity',
    fromDate: '2025-01-01',
    toDate: '2026-01-01',
    status: 'Active'
  },
  {
    code: 'NI002',
    memberCode: 'MEM005',
    reason: 'Special request by member',
    fromDate: '2025-05-15',
    toDate: '2025-12-31',
    status: 'Active'
  },
  {
    code: 'NI003',
    memberCode: 'MEM012',
    reason: 'Legal dispute pending',
    fromDate: '2025-06-01',
    toDate: '2027-06-01',
    status: 'Active'
  },
  {
    code: 'NI004',
    memberCode: 'MEM020',
    reason: 'Temporary hold on account',
    fromDate: '2024-01-01',
    toDate: '2024-12-31',
    status: 'Inactive'
  }
];

async function seed() {
  try {
    await initializeDatabase();
    await NoInterestMember.deleteMany({});
    console.log('Local PostgreSQL database ready');

    for (const record of dummyData) {
      const existing = await NoInterestMember.findOne({ code: record.code }).lean();
      if (existing) {
        await NoInterestMember.findByIdAndUpdate(existing.id, { $set: record }, { new: true });
      } else {
        await NoInterestMember.create(record);
      }
    }

    console.log('Inserted/updated 4 dummy records');
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

seed();

