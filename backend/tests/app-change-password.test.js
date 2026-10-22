// A member signed in to the mobile app changes their own password: the old
// password and every token issued with it stop working, and the response
// carries a fresh token for this device.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'app-change-password-test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const banking = require('../services/banking.service');
const appPortal = require('../services/appPortal.service');
const { Branch } = require('../models/banking.models');
const { initializeDatabase, closeDatabase } = require('../config/postgres');

const RUN = `P${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const BRANCH = `${RUN}B`;
const MOBILE = `96${String(Math.floor(10000000 + Math.random() * 89999999))}`;
const admin = { actorUser: { isSuperAdmin: true } };
const principalOf = (token) => jwt.decode(token);
const ctx = {};

test.after(async () => { if (closeDatabase) await closeDatabase(); });

test('setup', async () => {
  await initializeDatabase();
  await Branch.create({ code: BRANCH, label: 'PASSWORD TEST' });
  await banking.createResource('members', { name: `Password ${RUN}`, branchCode: BRANCH, mobileNo: MOBILE, password: 'old-pass', status: 'ACTIVE' }, admin);
  ctx.token = (await appPortal.login(MOBILE, 'old-pass')).token;
});

test('a wrong current password, a short or unchanged new one is refused', async () => {
  const principal = principalOf(ctx.token);
  await assert.rejects(appPortal.changePassword(principal, 'nope', 'new-pass'), /Current password is incorrect/);
  await assert.rejects(appPortal.changePassword(principal, 'old-pass', 'abc'), /at least 4 characters/);
  await assert.rejects(appPortal.changePassword(principal, 'old-pass', 'old-pass'), /must be different/);
  assert.ok((await appPortal.resolveAccount(principal)).code, 'the session still works');
});

test('changing it ends the old password and token; the new token works', async () => {
  const principal = principalOf(ctx.token);
  const result = await appPortal.changePassword(principal, 'old-pass', 'new-pass');
  assert.ok(result.token);
  assert.equal(result.account.type, 'member');
  await assert.rejects(appPortal.resolveAccount(principal), /Session expired/);
  assert.ok((await appPortal.resolveAccount(principalOf(result.token))).code);
  await assert.rejects(appPortal.login(MOBILE, 'old-pass'), /Invalid mobile number or password/);
  assert.ok((await appPortal.login(MOBILE, 'new-pass')).token);
});
