// Branch scoping: a user with a branchCode (not a super admin) only sees and
// changes the records of that branch. Shared by the banking service and the
// SMS service so both apply the same rule.

const BRANCH_SCOPED_RESOURCES = new Set([
  'branches',
  'employees',
  'members',
  'demandLists',
  'noInterestMembers',
  'vouchers',
  'bankTransactions'
]);

function cleanUpper(value) {
  return String(value ?? '').trim().toUpperCase();
}

function getScopedBranchCode(user = {}) {
  if (!user || user.isSuperAdmin) {
    return '';
  }
  return cleanUpper(user.branchCode);
}

function resolveBranchCode(user = {}, branchCode = '') {
  const scopedBranchCode = getScopedBranchCode(user);
  if (scopedBranchCode) {
    return scopedBranchCode;
  }
  return cleanUpper(branchCode);
}

function isBranchScopedResource(resource) {
  return BRANCH_SCOPED_RESOURCES.has(resource);
}

function applyBranchScope(query = {}, resource = '', user = {}) {
  const branchCode = resolveBranchCode(user);
  if (!branchCode) {
    return query;
  }
  if (resource === 'branches') {
    query.code = branchCode;
    return query;
  }
  if (isBranchScopedResource(resource)) {
    query.branchCode = branchCode;
  }
  return query;
}

function canAccessBranchRecord(resource, record = {}, user = {}) {
  const branchCode = resolveBranchCode(user);
  if (!branchCode) {
    return true;
  }
  if (resource === 'branches') {
    return cleanUpper(record.code || '') === branchCode;
  }
  if (!isBranchScopedResource(resource)) {
    return true;
  }
  return cleanUpper(record.branchCode || '') === branchCode;
}

module.exports = {
  applyBranchScope,
  canAccessBranchRecord,
  getScopedBranchCode,
  isBranchScopedResource,
  resolveBranchCode
};
