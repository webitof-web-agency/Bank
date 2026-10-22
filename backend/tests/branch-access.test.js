// Staff manage the whole society: a user's own branch never limits what they
// see or change (their role's permissions decide that). A branch the user
// picks as a filter still applies.
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyBranchScope, canAccessBranchRecord, getScopedBranchCode, resolveBranchCode } = require('../utils/branchScope');

const manager = { isSuperAdmin: false, branchCode: '1', permissionCodes: ['members.update'] };

test('a manager with a branch is not limited to it', () => {
  assert.equal(getScopedBranchCode(manager), '');
  assert.deepEqual(applyBranchScope({}, 'members', manager), {}, 'every member is listed');
  assert.deepEqual(applyBranchScope({}, 'branches', manager), {}, 'every branch is listed');
  assert.equal(canAccessBranchRecord('members', { branchCode: '60' }, manager), true, 'can edit a member of another branch');
  assert.equal(canAccessBranchRecord('branches', { code: '60' }, manager), true, 'can edit another branch');
});

test('a branch picked as a filter still applies', () => {
  assert.equal(resolveBranchCode(manager, ''), '', 'no filter: all branches');
  assert.equal(resolveBranchCode(manager, '60'), '60');
  assert.equal(resolveBranchCode({ isSuperAdmin: true }, ' 7 '), '7');
});
