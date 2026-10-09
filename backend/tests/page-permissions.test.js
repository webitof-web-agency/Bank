// Role permissions are enforced per page and per action: View, Create, Edit
// and Delete are separate, voucher routes check the page of the voucher's
// own type, and each report needs its own View.
//
// Runs against its own database (bank_test_page_permissions), never the
// working data. Users are injected per request (x-test-user), so this tests
// the route guards, not login.
process.env.PG_DATABASE = process.env.PAGE_PERMISSIONS_TEST_DATABASE || 'bank_test_page_permissions';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { Voucher } = require('../models/banking.models');
const { initializeDatabase, closeDatabase } = require('../config/postgres');

const RUN = `P${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const user = (...permissions) => ({ id: null, isSuperAdmin: false, branchCode: '', permissions });
const USERS = {
  admin: { id: null, isSuperAdmin: true, permissions: [] },
  memberCreator: user('master.members.view', 'master.members.create'),
  memberEditor: user('master.members.view', 'master.members.edit'),
  memberVouchers: user('transactions.member.view', 'transactions.member.create'),
  bankViewer: user('transactions.bank.view'),
  cashBook: user('reports.cash-book.view'),
  employeesViewer: user('master.employees.view'),
  notificationsViewer: user('workspace.notifications.view'),
  settingsOnly: user('admin.settings.view'),
  filesCreator: user('workspace.files.view', 'workspace.files.create')
};

let server;
let baseUrl;

async function call(method, path, { as, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-user': as },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_e) { json = null; }
  return { status: response.status, body: json };
}

const voucherIds = {};

test.before(async () => {
  await initializeDatabase();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = USERS[req.get('x-test-user')] || null; next(); });
  app.use('/api/banking', require('../routes/banking.routes'));
  app.use('/api/users', require('../routes/users.routes'));
  app.use('/api/roles', require('../routes/roles.routes'));
  app.use('/api/notifications', require('../routes/notifications.routes'));
  app.use('/api/files', require('../routes/files.routes'));
  app.use('/api/settings/storage', require('../routes/storageSettings.routes'));
  app.use(require('../middlewares/errorHandler'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  // One saved voucher of each of two pages (no journal needed for these checks).
  for (const [name, key] of [['member', 'loan-paid-member'], ['bank', 'loan-recv-cash']]) {
    const voucher = await Voucher.create({ voucherNo: `${RUN}-${name}`, date: '2026-10-01', amount: 1, partyType: 'other', details: { key } });
    voucherIds[name] = String(voucher._id || voucher.id);
  }
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDatabase();
});

test('master CRUD: Create, Edit and Delete are separate permissions', async () => {
  // Create only: may add, may not edit or delete.
  assert.notEqual((await call('POST', '/banking/masters/members', { as: 'memberCreator', body: {} })).status, 403);
  assert.equal((await call('PUT', '/banking/masters/members/x', { as: 'memberCreator', body: {} })).status, 403);
  assert.equal((await call('DELETE', '/banking/masters/members/x', { as: 'memberCreator' })).status, 403);
  assert.equal((await call('POST', '/banking/masters/members/x/restore', { as: 'memberCreator' })).status, 403);
  // Edit only: may not add or delete.
  assert.equal((await call('POST', '/banking/masters/members', { as: 'memberEditor', body: {} })).status, 403);
  assert.notEqual((await call('PUT', '/banking/masters/members/x', { as: 'memberEditor', body: {} })).status, 403);
  assert.equal((await call('DELETE', '/banking/masters/members/x', { as: 'memberEditor' })).status, 403);
  // Another master page entirely: no access.
  assert.equal((await call('GET', '/banking/masters/ledgers', { as: 'memberCreator' })).status, 403);
});

test('vouchers: each voucher type needs its own page permission', async () => {
  const list = await call('GET', '/banking/transactions/vouchers', { as: 'memberVouchers' });
  assert.equal(list.status, 200);
  const ids = list.body.data.map((row) => String(row.id || row._id));
  assert.ok(ids.includes(voucherIds.member));
  assert.equal(ids.includes(voucherIds.bank), false, 'a Member-only user must not list Bank vouchers');

  assert.equal((await call('GET', `/banking/transactions/vouchers/${voucherIds.member}`, { as: 'memberVouchers' })).status, 200);
  assert.equal((await call('GET', `/banking/transactions/vouchers/${voucherIds.bank}`, { as: 'memberVouchers' })).status, 404);
  // The SMS status of a voucher follows the same rule.
  assert.equal((await call('GET', `/banking/transactions/vouchers/${voucherIds.member}/sms`, { as: 'memberVouchers' })).status, 200);
  assert.equal((await call('GET', `/banking/transactions/vouchers/${voucherIds.bank}/sms`, { as: 'memberVouchers' })).status, 404);

  // Create on Member does not allow creating a Bank voucher, nor an unknown type.
  assert.equal((await call('POST', '/banking/transactions/vouchers', { as: 'memberVouchers', body: { details: { key: 'loan-recv-cash' } } })).status, 403);
  assert.equal((await call('POST', '/banking/transactions/vouchers', { as: 'memberVouchers', body: { details: { key: 'no-such-type' } } })).status, 400);
  assert.notEqual((await call('POST', '/banking/transactions/vouchers', { as: 'memberVouchers', body: { details: { key: 'loan-paid-member' } } })).status, 403);

  // Create does not include Edit or Delete, even on its own page.
  assert.equal((await call('PUT', `/banking/transactions/vouchers/${voucherIds.member}`, { as: 'memberVouchers', body: {} })).status, 403);
  assert.equal((await call('DELETE', `/banking/transactions/vouchers/${voucherIds.member}`, { as: 'memberVouchers' })).status, 403);

  // View-only on Bank: sees Bank vouchers, changes nothing.
  const bankList = await call('GET', '/banking/transactions/vouchers', { as: 'bankViewer' });
  assert.deepEqual(bankList.body.data.map((row) => String(row.id || row._id)).filter((id) => Object.values(voucherIds).includes(id)), [voucherIds.bank]);
  assert.equal((await call('POST', '/banking/transactions/vouchers', { as: 'bankViewer', body: { details: { key: 'loan-recv-cash' } } })).status, 403);
  assert.equal((await call('DELETE', `/banking/transactions/vouchers/${voucherIds.bank}`, { as: 'bankViewer' })).status, 403);
});

test('reports: each report needs its own View', async () => {
  assert.notEqual((await call('GET', '/banking/reports/cash-book', { as: 'cashBook' })).status, 403);
  assert.equal((await call('GET', '/banking/reports/day-book', { as: 'cashBook' })).status, 403);
  assert.equal((await call('GET', '/banking/reports/balance-sheet', { as: 'cashBook' })).status, 403);
  assert.equal((await call('GET', '/banking/reports/employee-ledger', { as: 'cashBook' })).status, 403);
});

test('dropdown lists: any page with forms or reports, not a settings-only user', async () => {
  assert.equal((await call('GET', '/banking/lookups', { as: 'memberVouchers' })).status, 200);
  assert.equal((await call('GET', '/banking/lookups', { as: 'cashBook' })).status, 200);
  assert.equal((await call('GET', '/banking/lookups', { as: 'settingsOnly' })).status, 403);
});

test('users: Employees View lists accounts but cannot create; roles list for the picker', async () => {
  assert.notEqual((await call('GET', '/users', { as: 'employeesViewer' })).status, 403);
  assert.equal((await call('POST', '/users', { as: 'employeesViewer', body: {} })).status, 403);
  assert.equal((await call('DELETE', '/users/x', { as: 'employeesViewer' })).status, 403);
  assert.notEqual((await call('GET', '/roles', { as: 'employeesViewer' })).status, 403);
  assert.equal((await call('POST', '/roles', { as: 'employeesViewer', body: {} })).status, 403);
});

test('notifications: sending one needs Create; files: Create is not Delete', async () => {
  assert.equal((await call('POST', '/notifications', { as: 'notificationsViewer', body: { title: 'x' } })).status, 403);
  assert.equal((await call('POST', '/notifications', { as: 'memberCreator', body: { title: 'x' } })).status, 403);
  assert.equal((await call('DELETE', '/files/x', { as: 'filesCreator' })).status, 403);
  assert.equal((await call('PATCH', '/files/x/archive', { as: 'filesCreator' })).status, 403);
});

test('settings: storage providers use the one Settings permission', async () => {
  assert.equal((await call('GET', '/settings/storage', { as: 'settingsOnly' })).status, 200);
  assert.equal((await call('PUT', '/settings/storage', { as: 'settingsOnly', body: {} })).status, 403);
  assert.equal((await call('GET', '/settings/storage', { as: 'memberCreator' })).status, 403);
});
