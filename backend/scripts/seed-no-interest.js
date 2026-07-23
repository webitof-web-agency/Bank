require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
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
    await mongoose.connect('mongodb://localhost:27017/bank_system');
    console.log('Connected to MongoDB');
    
    await NoInterestMember.deleteMany({});
    console.log('Cleared existing records');
    
    await NoInterestMember.insertMany(dummyData);
    console.log('Inserted 4 dummy records');
    
    await mongoose.disconnect();
    console.log('Disconnected');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();
