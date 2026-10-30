// Branch scoping. The society's staff manage the whole society, so a user's
// own branch never limits what they see or change: their role's permissions
// decide that (the society's rule, 2026-10-22). What remains is the branch a
// user picks as a filter. Shared by the banking and SMS services; the helpers
// stay so the callers keep one place to change if that rule ever changes.

const BRANCH_SCOPED_RESOURCES = new Set([
  'branches',
  'employees',
  'members',
  'demandLists',
  'noInterestMembers',
  'vouchers'
]);

function cleanUpper(value) {
  return String(value ?? '').trim().toUpperCase();
}

// No user is held to a branch (see above).
function getScopedBranchCode() {
  return '';
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
