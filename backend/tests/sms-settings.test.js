// SMS settings API (Phase 2) and voucher delete/restore branch security.
//
// - GET /api/sms/config/status: what is configured, never a secret's value.
// - GET/PUT /api/sms/templates, GET /api/sms/messages (filters, safe fields).
// - DELETE /banking/transactions/vouchers/:id and POST .../:id/restore:
//   a branch-scoped user gets 403 for another branch's voucher.
//
// Runs through the real routers and permission middleware; only the JWT step
// is replaced by a header naming one of the test users below. Uses its own
// database (bank_sms_settings_test), never the working data.
process.env.PG_DATABASE = process.env.SMS_SETTINGS_TEST_DATABASE || 'bank_sms_settings_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');
const banking = require('../services/banking.service');
const { Ledger, Member, Voucher, JournalLine, SmsTemplate } = require('../models/banking.models');
const { ACCOUNTING_ROLES } = require('../config/accountingConstants');
const { initializeDatabase, closeDatabase, restoreMainRow } = require('../config/postgres');

const RUN = `P${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const BRANCH = `${RUN}A`;
const OTHER_BRANCH = `${RUN}B`;
const code = (n) => `${RUN}M${n}`;
const API_KEY = 'settings-test-flowit-key-7f3a90';
const WEBHOOK_SECRET = 'settings-test-webhook-secret-c41b';

const USERS = {
  admin: { id: null, isSuperAdmin: true, permissions: [] },
  reader: { id: null, isSuperAdmin: false, branchCode: '', permissions: ['settings.read'] },
  nobody: { id: null, isSuperAdmin: false, branchCode: '', permissions: ['dashboard.read'] },
  branchA: { id: null, isSuperAdmin: false, branchCode: BRANCH, permissions: ['transactions.write', 'transactions.read'] },
  branchB: { id: null, isSuperAdmin: false, branchCode: OTHER_BRANCH, permissions: ['transactions.write', 'transactions.read'] }
};

// The connectivity-test block has its own suite (sms-test-send.test.js).
const withoutTest = ({ test: _test, ...rest }) => rest;

let db;
let server;
let baseUrl;

function setSmsEnv(overrides = {}) {
  Object.assign(process.env, {
    SMS_ENABLED: 'false',
    FLOWIT_BASE_URL: 'https://sms.flowitof.com',
    FLOWIT_API_KEY: API_KEY,
    FLOWIT_SENDER_ID: 'BANKRP',
    FLOWIT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    FLOWIT_TIMEOUT_MS: '7000',
    ...overrides
  });
}

async function call(method, path, { user = 'admin', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-user': user },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  return { status: response.status, text, body: text ? JSON.parse(text) : null };
}

const ssaVoucher = (memberCode, extra = {}) => ({
  date: '2026-10-07', voucherCategory: 'SSA Paid To Member', transactionType: 'payment', mode: 'Cash', amount: 700,
  partyType: 'member', partyCode: memberCode, narration: `${RUN}-voucher`, ...extra,
  details: { key: 'ssa-paid-member', payMode: 'Cash', sms: false, ...(extra.details || {}) }
});

test.before(async () => {
  setSmsEnv();
  db = await initializeDatabase();
  const app = express();
  app.use(express.json());
  // Stands in for requireAuth: everything after it (permissions, branch
  // scope) is the real code.
  app.use((req, _res, next) => {
    req.user = USERS[req.get('x-test-user')] || null;
    next();
  });
  app.use('/api/sms', require('../routes/sms.routes'));
  app.use('/api/banking', require('../routes/banking.routes'));
  app.use(require('../middlewares/errorHandler'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDatabase();
});

test.beforeEach(() => setSmsEnv());

test('setup: ledgers and one member in each branch', async () => {
  for (const role of ['CASH', 'SPECIAL_DEPOSIT']) {
    const semanticRole = ACCOUNTING_ROLES[role];
    if (await Ledger.findOne({ semanticRole })) continue;
    const removed = await Ledger.findOne({ semanticRole }).withDeleted().lean();
    if (removed) await restoreMainRow('ledgers', removed.id);
    else await Ledger.create({ code: `TEST-${role}`, name: role, semanticRole });
  }
  await Member.create({ code: code(1), name: 'Branch A member', branchCode: BRANCH, designation: 'CLERK', mobileNo: '+919871234560' });
  await Member.create({ code: code(2), name: 'Branch B member', branchCode: OTHER_BRANCH, designation: 'CLERK', mobileNo: '+919845678901' });
});

// ---------------------------------------------------------------------------
// Config status

test('config status: reports what is configured, never the API key or webhook secret', async () => {
  setSmsEnv({ SMS_ENABLED: 'true' });
  const { status, text, body } = await call('GET', '/sms/config/status', { user: 'reader' });
  assert.equal(status, 200);
  assert.deepEqual(withoutTest(body.data), {
    provider: 'flowit',
    smsEnabled: true,
    apiKeyConfigured: true,
    senderId: 'BANKRP',
    senderIdConfigured: true,
    webhookSecretConfigured: true,
    baseUrlValid: true,
    timeoutMs: 7000
  });
  assert.equal(text.includes(API_KEY), false, 'API key not in the response');
  assert.equal(text.includes(WEBHOOK_SECRET), false, 'webhook secret not in the response');
  assert.equal(/apiKey"\s*:\s*"/.test(text), false);
  assert.equal(/webhookSecret"\s*:\s*"/.test(text), false);
});

test('config status: nothing configured and SMS off by default', async () => {
  setSmsEnv({ SMS_ENABLED: '', FLOWIT_API_KEY: '', FLOWIT_SENDER_ID: '', FLOWIT_WEBHOOK_SECRET: '', FLOWIT_TIMEOUT_MS: '', FLOWIT_BASE_URL: 'http://insecure.example' });
  const { body } = await call('GET', '/sms/config/status', { user: 'reader' });
  assert.deepEqual(withoutTest(body.data), {
    provider: 'flowit',
    smsEnabled: false,
    apiKeyConfigured: false,
    senderId: '',
    senderIdConfigured: false,
    webhookSecretConfigured: false,
    baseUrlValid: false,
    timeoutMs: 10000
  });
});

test('config status: needs settings.read', async () => {
  assert.equal((await call('GET', '/sms/config/status', { user: 'nobody' })).status, 403);
  assert.equal((await call('GET', '/sms/config/status', { user: 'missing' })).status, 401);
});

// ---------------------------------------------------------------------------
// Templates

test('templates: list carries no secrets; the event code comes from the URL only', async () => {
  const existing = await SmsTemplate.findOne({ eventCode: 'MEMBER_SSA_PAID' }).lean();
  if (existing) await SmsTemplate.findByIdAndDelete(existing.id);

  const list = await call('GET', '/sms/templates', { user: 'reader' });
  assert.equal(list.status, 200);
  assert.equal(list.text.includes(API_KEY), false);
  assert.equal(list.text.includes(WEBHOOK_SECRET), false);
  const [ssa] = list.body.data;
  assert.equal(ssa.eventCode, 'MEMBER_SSA_PAID');
  assert.equal(ssa.label, 'SSA Paid To Member');
  assert.deepEqual(ssa.availableVariables, ['memberName', 'amount', 'voucherNo', 'date']);
  assert.equal(ssa.configured, false);
  assert.equal(ssa.isEnabled, false);

  // settings.read alone cannot save.
  assert.equal((await call('PUT', '/sms/templates/MEMBER_SSA_PAID', { user: 'reader', body: { isEnabled: false } })).status, 403);

  // Validation: unknown variable, enabling without a DLT ID, unknown event.
  assert.equal((await call('PUT', '/sms/templates/MEMBER_SSA_PAID', { body: { variableKeys: ['memberName', 'mobileNo'] } })).status, 400);
  assert.equal((await call('PUT', '/sms/templates/MEMBER_SSA_PAID', { body: { isEnabled: true, dltMessageId: '' } })).status, 400);
  assert.equal((await call('PUT', '/sms/templates/SOMETHING_ELSE', { body: { isEnabled: false } })).status, 400);
  assert.equal((await call('PUT', '/sms/templates/MEMBER_SSA_PAID', { body: { senderId: 'AB-12' } })).status, 400);
  const numericSender = await call('PUT', '/sms/templates/MEMBER_SSA_PAID', { body: { senderId: '54321', isEnabled: false } });
  assert.equal(numericSender.status, 200);
  assert.equal(numericSender.body.data.senderId, '54321');
  const repeated = await call('PUT', '/sms/templates/MEMBER_SSA_PAID', { body: { variableKeys: ['memberName', 'amount', 'amount', 'date'] } });
  assert.equal(repeated.status, 400);
  assert.match(repeated.body.message, /more than once.*amount/);

  // Saved disabled, with the variable order kept exactly as sent; an
  // eventCode in the body is ignored.
  const saved = await call('PUT', '/sms/templates/MEMBER_SSA_PAID', {
    body: { eventCode: 'HACKED', dltMessageId: 'TEST-DLT-1', senderId: 'bankrp', variableKeys: ['amount', 'memberName', 'voucherNo', 'date'], previewText: 'Preview', isEnabled: false }
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.eventCode, 'MEMBER_SSA_PAID');
  assert.equal(saved.body.data.senderId, 'BANKRP');
  assert.deepEqual(saved.body.data.variableKeys, ['amount', 'memberName', 'voucherNo', 'date']);
  assert.equal(saved.body.data.isEnabled, false);
  assert.equal(await SmsTemplate.findOne({ eventCode: 'HACKED' }).lean(), null);

  const enabled = await call('PUT', '/sms/templates/MEMBER_SSA_PAID', { body: { ...saved.body.data, isEnabled: true } });
  assert.equal(enabled.body.data.isEnabled, true);
  // Leave it disabled: nothing in this suite should be able to send.
  await call('PUT', '/sms/templates/MEMBER_SSA_PAID', { body: { ...saved.body.data, isEnabled: false } });
});

// ---------------------------------------------------------------------------
// Messages log

async function insertMessage(fields) {
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO "sms_messages" ("id", "createdAt", "updatedAt", "idempotencyKey", "eventCode", "entityType", "entityCode", "voucherId", "voucherNo", "maskedMobile", "mobileHash", "provider", "status", "skipReason", "errorCode", "errorMessage", "attempts")
     VALUES ($1, $2, $2, $3, 'MEMBER_SSA_PAID', 'MEMBER', $4, $5, $6, $7, $8, 'flowit', $9, $10, $11, $12, $13)`,
    [crypto.randomUUID(), fields.createdAt || now, `${RUN}:${crypto.randomUUID()}`, fields.entityCode, crypto.randomUUID(), fields.voucherNo,
      fields.maskedMobile || null, fields.mobileHash || null, fields.status, fields.skipReason || null, fields.errorCode || null, fields.errorMessage || null, fields.attempts || 0]
  );
}

test('messages: filters by status, event, voucher no, member code and date; never returns the number hash', async () => {
  await insertMessage({ entityCode: code(1), voucherNo: `${RUN}-V1`, status: 'SENT', maskedMobile: '98XXXXXX60', mobileHash: 'a'.repeat(64), attempts: 1, createdAt: '2026-10-01T10:00:00Z' });
  await insertMessage({ entityCode: code(1), voucherNo: `${RUN}-V2`, status: 'SKIPPED', skipReason: 'NO_MOBILE', createdAt: '2026-10-03T10:00:00Z' });
  await insertMessage({ entityCode: code(2), voucherNo: `${RUN}-V3`, status: 'FAILED', errorCode: '416', errorMessage: 'Insufficient wallet balance', attempts: 1, createdAt: '2026-10-05T10:00:00Z' });

  const byMember = await call('GET', `/sms/messages?memberCode=${code(1).toLowerCase()}`, { user: 'reader' });
  assert.equal(byMember.status, 200);
  assert.deepEqual(byMember.body.data.map((row) => row.voucherNo).sort(), [`${RUN}-V1`, `${RUN}-V2`]);
  assert.equal(byMember.text.includes('mobileHash'), false);
  assert.equal(byMember.text.includes('a'.repeat(64)), false);

  const failed = await call('GET', `/sms/messages?status=failed&memberCode=${code(2)}`, { user: 'reader' });
  assert.deepEqual(failed.body.data.map((row) => [row.voucherNo, row.errorCode]), [[`${RUN}-V3`, '416']]);

  const byVoucher = await call('GET', `/sms/messages?voucherNo=${RUN}-V2&eventCode=MEMBER_SSA_PAID`, { user: 'reader' });
  assert.deepEqual(byVoucher.body.data.map((row) => row.skipReason), ['NO_MOBILE']);
  assert.equal((await call('GET', `/sms/messages?voucherNo=${RUN}-V2&eventCode=OTHER_EVENT`, { user: 'reader' })).body.data.length, 0);

  const range = await call('GET', `/sms/messages?memberCode=${code(1)}&dateFrom=2026-10-02&dateTo=2026-10-03`, { user: 'reader' });
  assert.deepEqual(range.body.data.map((row) => row.voucherNo), [`${RUN}-V2`]);

  assert.equal((await call('GET', '/sms/messages?dateFrom=01-10-2026', { user: 'reader' })).status, 400);

  // Provider text echoing a credential is redacted in the log.
  await insertMessage({ entityCode: code(2), voucherNo: `${RUN}-V4`, status: 'FAILED', errorCode: '412', errorMessage: `Bad key ${API_KEY}` });
  const echoed = await call('GET', `/sms/messages?voucherNo=${RUN}-V4`, { user: 'reader' });
  assert.equal(echoed.body.data[0].errorMessage, 'Bad key [redacted]');
  assert.equal(echoed.text.includes(API_KEY), false);
  assert.equal((await call('GET', '/sms/messages', { user: 'nobody' })).status, 403);
});

test('messages: date filters are whole India (IST) days, inclusive at both ends', async () => {
  const member = code(3);
  // 2026-09-14 IST runs from 2026-09-13T18:30:00Z to 2026-09-14T18:29:59.999Z.
  const rows = [
    ['B1', '2026-09-13T18:29:59.999Z'], // 13-09 23:59:59.999 IST
    ['B2', '2026-09-13T18:30:00.000Z'], // 14-09 00:00 IST
    ['B3', '2026-09-14T18:29:59.000Z'], // 14-09 23:59:59 IST
    ['B4', '2026-09-14T18:30:00.000Z'] // 15-09 00:00 IST
  ];
  for (const [voucherNo, createdAt] of rows) await insertMessage({ entityCode: member, voucherNo: `${RUN}-${voucherNo}`, status: 'SKIPPED', skipReason: 'SMS_DISABLED', createdAt });
  const list = async (query) => (await call('GET', `/sms/messages?memberCode=${member}&${query}`, { user: 'reader' })).body.data.map((row) => row.voucherNo.slice(-2)).sort();
  assert.deepEqual(await list('dateFrom=2026-09-14&dateTo=2026-09-14'), ['B2', 'B3']);
  assert.deepEqual(await list('dateFrom=2026-09-14'), ['B2', 'B3', 'B4']);
  assert.deepEqual(await list('dateTo=2026-09-14'), ['B1', 'B2', 'B3']);
  assert.deepEqual(await list('dateFrom=2026-09-13&dateTo=2026-09-15'), ['B1', 'B2', 'B3', 'B4']);
});

test('messages: a branch-scoped user sees only SMS for their own branch\'s vouchers', async () => {
  const own = await banking.createVoucher(ssaVoucher(code(1)), { actorUser: USERS.branchA });
  const other = await banking.createVoucher(ssaVoucher(code(2)), { actorUser: USERS.branchB });
  for (const [voucher, memberCode] of [[own, code(1)], [other, code(2)]]) {
    await db.query(
      `INSERT INTO "sms_messages" ("id", "createdAt", "updatedAt", "idempotencyKey", "eventCode", "entityCode", "voucherId", "voucherNo", "status", "skipReason")
       VALUES ($1, NOW(), NOW(), $2, 'MEMBER_SSA_PAID', $3, $4, $5, 'SKIPPED', 'SMS_DISABLED')`,
      [crypto.randomUUID(), `${voucher.id}:MEMBER_SSA_PAID:${memberCode}`, memberCode, voucher.id, voucher.voucherNo]
    );
  }
  USERS.branchReaderA = { id: null, isSuperAdmin: false, branchCode: BRANCH, permissions: ['settings.read'] };
  const seen = await call('GET', '/sms/messages?limit=500', { user: 'branchReaderA' });
  assert.equal(seen.status, 200);
  const ids = seen.body.data.map((row) => row.voucherId);
  assert.ok(ids.includes(own.id));
  assert.equal(ids.includes(other.id), false);
  assert.ok(seen.body.data.every((row) => row.entityCode !== code(2)));
  // Asking for the other branch's voucher directly returns nothing.
  assert.equal((await call('GET', `/sms/messages?voucherId=${other.id}`, { user: 'branchReaderA' })).body.data.length, 0);
  // An unscoped reader sees both.
  const all = (await call('GET', '/sms/messages?limit=500', { user: 'reader' })).body.data.map((row) => row.voucherId);
  assert.ok(all.includes(own.id) && all.includes(other.id));
});

// ---------------------------------------------------------------------------
// Voucher delete / restore: branch security

async function journalCount(voucherId) {
  return (await JournalLine.find({ voucherId }).lean()).length;
}

test('delete: another branch\'s voucher is 403 and stays intact; own branch deletes', async () => {
  const voucher = await banking.createVoucher(ssaVoucher(code(1)), { actorUser: USERS.branchA });
  const journals = await journalCount(voucher.id);
  assert.ok(journals > 0);

  const denied = await call('DELETE', `/banking/transactions/vouchers/${voucher.id}`, { user: 'branchB' });
  assert.equal(denied.status, 403);
  assert.ok(await Voucher.findById(voucher.id).lean(), 'voucher still there');
  assert.equal(await journalCount(voucher.id), journals, 'journal lines untouched');

  // Same rule when called directly with an actor.
  await assert.rejects(banking.deleteVoucher(voucher.id, { actorUser: USERS.branchB }), (error) => error.statusCode === 403);
  assert.ok(await Voucher.findById(voucher.id).lean());

  const ok = await call('DELETE', `/banking/transactions/vouchers/${voucher.id}`, { user: 'branchA' });
  assert.equal(ok.status, 200);
  assert.equal(await Voucher.findById(voucher.id).lean(), null);
  assert.equal(await journalCount(voucher.id), 0);

  // Unknown id is still a plain 404.
  assert.equal((await call('DELETE', `/banking/transactions/vouchers/${crypto.randomUUID()}`, { user: 'branchA' })).status, 404);
});

test('restore: another branch\'s deleted voucher is 403 and stays deleted; own branch restores', async () => {
  const voucher = await banking.createVoucher(ssaVoucher(code(1)), { actorUser: USERS.branchA });
  const journals = await journalCount(voucher.id);
  assert.equal((await call('DELETE', `/banking/transactions/vouchers/${voucher.id}`, { user: 'branchA' })).status, 200);

  const denied = await call('POST', `/banking/transactions/vouchers/${voucher.id}/restore`, { user: 'branchB' });
  assert.equal(denied.status, 403);
  assert.equal(await Voucher.findById(voucher.id).lean(), null, 'still deleted');
  await assert.rejects(banking.restoreVoucher(voucher.id, { actorUser: USERS.branchB }), (error) => error.statusCode === 403);

  const ok = await call('POST', `/banking/transactions/vouchers/${voucher.id}/restore`, { user: 'branchA' });
  assert.equal(ok.status, 200);
  assert.ok(await Voucher.findById(voucher.id).lean());
  assert.equal(await journalCount(voucher.id), journals, 'journal lines restored with it');
});

test('edit: another branch\'s voucher is 403 (same as delete/restore); reading it stays 404', async () => {
  const voucher = await banking.createVoucher(ssaVoucher(code(1)), { actorUser: USERS.branchA });
  const denied = await call('PUT', `/banking/transactions/vouchers/${voucher.id}`, { user: 'branchB', body: { narration: 'cross-branch edit' } });
  assert.equal(denied.status, 403);
  assert.notEqual((await Voucher.findById(voucher.id).lean()).narration, 'cross-branch edit');
  assert.equal((await call('GET', `/banking/transactions/vouchers/${voucher.id}`, { user: 'branchB' })).status, 404);
  const ok = await call('PUT', `/banking/transactions/vouchers/${voucher.id}`, { user: 'branchA', body: { narration: 'own edit' } });
  assert.equal(ok.status, 200);
  assert.equal((await call('PUT', `/banking/transactions/vouchers/${crypto.randomUUID()}`, { user: 'branchA', body: {} })).status, 404);
});

test('super admin may delete and restore any branch\'s voucher', async () => {
  const voucher = await banking.createVoucher(ssaVoucher(code(2)), { actorUser: USERS.branchB });
  assert.equal((await call('DELETE', `/banking/transactions/vouchers/${voucher.id}`, { user: 'admin' })).status, 200);
  assert.equal((await call('POST', `/banking/transactions/vouchers/${voucher.id}/restore`, { user: 'admin' })).status, 200);
  assert.ok(await Voucher.findById(voucher.id).lean());
});
