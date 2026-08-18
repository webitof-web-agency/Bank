const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../services/banking.service.js');
let content = fs.readFileSync(filePath, 'utf8');

// Import getNextSequenceValue
if (!content.includes('sequence.service')) {
  content = content.replace(
    /const { toResponse } = require\('\.\.\/utils\/response'\);/,
    `const { toResponse } = require('../utils/response');\nconst { getNextSequenceValue } = require('./sequence.service');`
  );
}

// Remove old generateNextMemberCode and generateNextMembershipNo
content = content.replace(
  /async function generateNextMemberCode\(\) {[\s\S]*?async function generateNextMembershipNo\(\) {[\s\S]*?return `MB-\${maxNumber \+ 1}`;[\s\n]*}/,
  ``
);

// Update createResource auto-generation logic
// We need to inject code generation for various entities.
const oldMembersGeneration = `  if (resource === 'members') {
    if (!payload.code) {
      payload.code = await generateNextMemberCode();
    }
    if (!payload.membershipNo) {
      payload.membershipNo = await generateNextMembershipNo();
    }
  }`;

const newMembersGeneration = `  
  const getSequenceField = () => {
    if (['members', 'employees', 'branches', 'ledgers', 'bankAccounts', 'noInterestMembers'].includes(resource)) return 'code';
    if (resource === 'vouchers') return 'voucherNo';
    if (resource === 'bankTransactions') return 'transactionNo';
    if (resource === 'demandLists') return 'demandListNo';
    return null;
  };
  
  const sequenceField = getSequenceField();
  if (sequenceField && !payload[sequenceField]) {
    const tableName = resource === 'bankAccounts' ? 'bank_accounts' 
                    : resource === 'bankTransactions' ? 'bank_transactions'
                    : resource === 'demandLists' ? 'demand_lists'
                    : resource === 'noInterestMembers' ? 'no_interest_members'
                    : resource;
    payload[sequenceField] = await getNextSequenceValue(tableName, sequenceField);
  }

  if (resource === 'members' && !payload.membershipNo) {
    payload.membershipNo = await getNextSequenceValue('members', 'membershipNo');
  }
`;

content = content.replace(oldMembersGeneration, newMembersGeneration);

// For employees, in createResource:
const oldEmployeeCreate = `    const payload = normalizeEmployeeUser(data);
    payload.branchCode = resolveBranchCode(actorUser, payload.branchCode);
    if (meta.actorUserId) {
      payload.createdByUserId = meta.actorUserId;
      payload.updatedByUserId = meta.actorUserId;
    }`;

const newEmployeeCreate = `    const payload = normalizeEmployeeUser(data);
    payload.branchCode = resolveBranchCode(actorUser, payload.branchCode);
    if (!payload.code || payload.code.startsWith('EMP-')) {
      payload.code = await getNextSequenceValue('employees', 'code');
    }
    if (meta.actorUserId) {
      payload.createdByUserId = meta.actorUserId;
      payload.updatedByUserId = meta.actorUserId;
    }`;

content = content.replace(oldEmployeeCreate, newEmployeeCreate);

// For members updateResource:
const oldMemberUpdate = `    payload.code = payload.code || current.code || await generateNextMemberCode();
    payload.membershipNo = payload.membershipNo || current.membershipNo || await generateNextMembershipNo();`;

const newMemberUpdate = `    payload.code = payload.code || current.code;
    payload.membershipNo = payload.membershipNo || current.membershipNo;`;

content = content.replace(oldMemberUpdate, newMemberUpdate);


fs.writeFileSync(filePath, content, 'utf8');
console.log('banking.service.js updated successfully with sequence service.');
