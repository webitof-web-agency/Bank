const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../services/banking.service.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Imports
content = content.replace(
  /const {\s*BANK_ACCOUNT_SEEDS[\s\S]*?VOUCHER_SEEDS\s*} = require\('\.\.\/config\/bankingSeed'\);/,
  `const {
  BANK_ACCOUNT_SEEDS,
  BANK_TRANSACTION_SEEDS,
  BRANCH_SEEDS,
  COMMITTEE_SEED,
  COMMITTEE_DIRECTOR_SEEDS,
  DEMAND_LIST_SEEDS,
  DEMAND_LINE_SEEDS,
  EMPLOYEE_SEEDS,
  LEDGER_SEEDS,
  MEMBER_SEEDS,
  MEMBER_DEMAND_DEFAULT_SEEDS,
  NO_INTEREST_MEMBER_SEEDS,
  RATE_SEEDS,
  RECOVERY_LINE_SEEDS,
  SOCIETY_SEED,
  VOUCHER_SEEDS
} = require('../config/bankingSeed');`
);

content = content.replace(
  /const {\s*BankAccount[\s\S]*?Voucher\s*} = require\('\.\.\/models\/banking\.models'\);/,
  `const {
  BankAccount,
  BankTransaction,
  Branch,
  Committee,
  CommitteeDirector,
  Employee,
  DemandList,
  DemandLine,
  Ledger,
  Member,
  MemberDemandDefault,
  NoInterestMember,
  Rate,
  RecoveryLine,
  Society,
  Voucher
} = require('../models/banking.models');`
);

// 2. Constants & Scopes
content = content.replace(
  /const BRANCH_SCOPED_RESOURCES = new Set\(\[[\s\S]*?\]\);/,
  `const BRANCH_SCOPED_RESOURCES = new Set([
  'branches',
  'employees',
  'members',
  'demandLists',
  'noInterestMembers',
  'vouchers',
  'bankTransactions'
]);`
);

// 3. Summarize record
content = content.replace(
  /resource === 'managers'[\s\S]*?:\s*resource === 'members'/,
  `resource === 'members'`
);
content = content.replace(
  /resource === 'demands'/,
  `resource === 'demandLists'`
);
content = content.replace(
  /code: record\.demandNo \|\| '',/,
  `code: record.demandListNo || '',`
);

// 4. getResourceMeta
content = content.replace(
  /managers: {[\s\S]*?listUrl: '\/app\/master\/managers',\s*detailUrl: '\/app\/master\/managers'\s*},/g,
  ``
);
content = content.replace(
  /managers: {[\s\S]*?normalize\(data = {}\) {[\s\S]*?}\s*},/g,
  ``
);
content = content.replace(
  /demands: {[\s\S]*?listUrl: '\/app\/master\/demands',\s*detailUrl: \(record\) => `\/app\/master\/demands\/\${record\.id}`\s*},/g,
  `demandLists: {
      label: 'Demand List',
      module: 'master',
      type: 'master',
      severity: 'medium',
      listUrl: '/app/master/demands',
      detailUrl: (record) => \`/app/master/demands/\${record.id}\`
    },`
);

// 5. RESOURCE_DEFS
content = content.replace(
  /managers: {[\s\S]*?payload: toMixed\(data\.payload, {}\)\s*};\s*}\s*},/g,
  ``
);
content = content.replace(
  /demands: {[\s\S]*?model: Demand,[\s\S]*?searchFields: \['demandNo'.*?,[\s\S]*?normalize\(data = {}\) {[\s\S]*?demandNo: cleanUpper\(data\.demandNo\),[\s\S]*?payload: toMixed\(data\.payload, {}\)\s*};\s*}\s*},/g,
  `demandLists: {
    model: DemandList,
    searchFields: ['demandListNo', 'month', 'branchCode', 'status', 'remarks'],
    normalize(data = {}) {
      return {
        demandListNo: cleanUpper(data.demandListNo),
        demandListDate: cleanText(data.demandListDate),
        branchCode: cleanUpper(data.branchCode),
        month: cleanText(data.month),
        year: cleanText(data.year),
        status: cleanText(data.status, 'Pending'),
        remarks: cleanText(data.remarks),
        payload: toMixed(data.payload, {})
      };
    }
  },`
);

// 6. seedBankingData
content = content.replace(
  /async function seedBankingData\(\) {[\s\S]*?return true;\s*}/,
  `async function seedBankingData() {
  await seedOne(Society, { key: 'default' }, SOCIETY_SEED);
  await seedOne(Committee, { key: 'default' }, COMMITTEE_SEED);
  await seedMany(CommitteeDirector, (row) => ({ committeeKey: row.committeeKey, name: row.name }), COMMITTEE_DIRECTOR_SEEDS);
  
  await seedMany(Branch, (row) => ({ code: cleanUpper(row.code) }), BRANCH_SEEDS);
  await seedMany(Member, (row) => ({ code: cleanUpper(row.code) }), MEMBER_SEEDS);
  await seedMany(MemberDemandDefault, (row) => ({ memberCode: row.memberCode }), MEMBER_DEMAND_DEFAULT_SEEDS);
  
  await seedMany(User, (row) => ({ code: cleanUpper(row.code) }), EMPLOYEE_SEEDS.map((row) => normalizeEmployeeUser({
    ...row,
    fullName: row.name,
    name: row.name,
    username: row.username || cleanLower(row.code),
    email: row.email || \`\${cleanLower(row.code)}@bank.local\`,
    password: row.password || row.code || row.name,
    status: row.status || 'Active'
  })));
  await seedMany(Employee, (row) => ({ code: cleanUpper(row.code) }), EMPLOYEE_SEEDS.map(row => ({
    code: cleanUpper(row.code),
    name: cleanText(row.name),
    designation: cleanText(row.designation),
    branchCode: cleanUpper(row.branchCode),
    isActive: row.isActive !== false
  })));

  await seedMany(Ledger, (row) => ({ code: cleanUpper(row.code) }), LEDGER_SEEDS);
  await seedMany(Rate, (row) => ({ code: cleanUpper(row.code) }), RATE_SEEDS);
  await seedMany(BankAccount, (row) => ({ code: cleanUpper(row.code) }), BANK_ACCOUNT_SEEDS);
  
  await seedMany(DemandList, (row) => ({ demandListNo: cleanUpper(row.demandListNo) }), DEMAND_LIST_SEEDS);
  await seedMany(DemandLine, (row) => ({ demandListNo: row.demandListNo, memberCode: row.memberCode }), DEMAND_LINE_SEEDS);
  
  await seedMany(NoInterestMember, (row) => ({ code: cleanUpper(row.code) }), NO_INTEREST_MEMBER_SEEDS);
  await seedMany(Voucher, (row) => ({ voucherNo: cleanUpper(row.voucherNo) }), VOUCHER_SEEDS);
  await seedMany(RecoveryLine, (row) => ({ voucherNo: row.voucherNo, memberCode: row.memberCode }), RECOVERY_LINE_SEEDS);
  
  await seedMany(BankTransaction, (row) => ({ transactionNo: cleanUpper(row.transactionNo) }), BANK_TRANSACTION_SEEDS);
  return true;
}`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('banking.service.js updated successfully.');
