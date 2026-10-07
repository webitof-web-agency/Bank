// SSA Paid To Member + SMS, end to end through banking.createVoucher /
// updateVoucher: outbox row in the voucher's transaction, Flowit called only
// after commit, failures never failing the save, no resend on edit, branch
// security, and the delivery-report webhook.
//
// Runs against its own database (bank_sms_test by default, created empty on
// first use), never the working data: set before anything loads .env.
process.env.PG_DATABASE = process.env.SMS_TEST_DATABASE || 'bank_sms_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const banking = require('../services/banking.service');
const sms = require('../services/sms/sms.service');
const { Ledger, Member, Voucher, JournalLine, SmsTemplate } = require('../models/banking.models');
const { ACCOUNTING_ROLES } = require('../config/accountingConstants');
const { initializeDatabase, closeDatabase, restoreMainRow } = require('../config/postgres');

const RUN = `S${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const BRANCH = `${RUN}A`;
const OTHER_BRANCH = `${RUN}B`;
const code = (n) => `${RUN}M${n}`;
const API_KEY = 'integration-flowit-key-91c2';
const WEBHOOK_SECRET = 'integration-webhook-secret-5d1e';
const branchUser = { id: null, branchCode: BRANCH, isSuperAdmin: false };
const meta = { actorUserId: null, actorUser: branchUser };

const realFetch = globalThis.fetch;
const flowitCalls = [];
// What the stubbed Flowit answers next; default: accepted.
let flowitReply = async () => ({ status: 200, body: { return: true, request_id: `req-${flowitCalls.length}`, message: ['Message sent successfully'] } });
let onFlowitCall = null;

let db;
let server;
let baseUrl;

function setSmsEnv(overrides = {}) {
  Object.assign(process.env, {
    SMS_ENABLED: 'true',
    FLOWIT_BASE_URL: 'https://sms.flowitof.com',
    FLOWIT_API_KEY: API_KEY,
    FLOWIT_SENDER_ID: 'BANKRP',
    FLOWIT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    FLOWIT_WEBHOOK_HEADER: 'x-webhook-secret',
    FLOWIT_TIMEOUT_MS: '2000',
    ...overrides
  });
}

const ssaVoucher = (memberCode, extra = {}) => ({
  date: '2026-10-07', voucherCategory: 'SSA Paid To Member', transactionType: 'payment', mode: 'Cash', amount: 1500,
  partyType: 'member', partyCode: memberCode, ...extra,
  details: { key: 'ssa-paid-member', payMode: 'Cash', sms: true, ...(extra.details || {}) }
});

async function smsRows(voucherId) {
  return (await db.query('SELECT * FROM "sms_messages" WHERE "voucherId" = $1 ORDER BY "createdAt"', [voucherId])).rows;
}
async function smsRowsForMember(memberCode) {
  return (await db.query('SELECT * FROM "sms_messages" WHERE "entityCode" = $1', [memberCode])).rows;
}

async function saveTemplate(fields = {}) {
  return sms.saveTemplate('MEMBER_SSA_PAID', { dltMessageId: '111111', senderId: '', isEnabled: true, ...fields });
}

test.before(async () => {
  db = await initializeDatabase();
  globalThis.fetch = async (url, options = {}) => {
    if (!String(url).startsWith('https://sms.flowitof.com/')) return realFetch(url, options);
    const call = { url: String(url), headers: options.headers, body: JSON.parse(options.body) };
    flowitCalls.push(call);
    if (onFlowitCall) await onFlowitCall(call);
    const reply = await flowitReply(call, options);
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
  };
  const app = express();
  app.use(express.json());
  app.use('/api', require('../routes'));
  app.use(require('../middlewares/errorHandler'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  globalThis.fetch = realFetch;
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDatabase();
});

test.beforeEach(() => {
  flowitCalls.length = 0;
  onFlowitCall = null;
  flowitReply = async () => ({ status: 200, body: { return: true, request_id: `req-${RUN}-${Math.random().toString(36).slice(2, 10)}`, message: ['Message sent successfully'] } });
  setSmsEnv();
});

test('setup: ledgers, members, no SSA template yet', async () => {
  for (const role of ['CASH', 'SPECIAL_DEPOSIT']) {
    const semanticRole = ACCOUNTING_ROLES[role];
    if (await Ledger.findOne({ semanticRole })) continue;
    const removed = await Ledger.findOne({ semanticRole }).withDeleted().lean();
    if (removed) await restoreMainRow('ledgers', removed.id);
    else await Ledger.create({ code: `TEST-${role}`, name: role, semanticRole });
  }
  const members = [
    [1, '+919876543210'], // valid
    [2, ''], // no mobile
    [3, '+911212121212'], // the legacy placeholder: invalid
    [4, '+919999999999'], // placeholder
    [5, '+919812345678', { dismembered: true }],
    [6, '+919823456789'], // soft-deleted below
    [7, '+919834567890'],
    [8, '919845678901'],
    [9, '+919856789012']
  ];
  for (const [n, mobileNo, extra = {}] of members) {
    await Member.create({ code: code(n), name: `Member ${n}`, branchCode: BRANCH, designation: 'CLERK', mobileNo, ...extra });
  }
  await Member.create({ code: code(90), name: 'Other branch member', branchCode: OTHER_BRANCH, designation: 'CLERK', mobileNo: '+919867890123' });
  const deleted = await Member.findOne({ code: code(6) }).lean();
  await Member.findByIdAndDelete(deleted.id);
  // A shared test database may keep a template from an earlier run.
  const existing = await SmsTemplate.findOne({ eventCode: 'MEMBER_SSA_PAID' }).lean();
  if (existing) await SmsTemplate.findByIdAndDelete(existing.id);
});

test('missing SSA template: voucher saves, SMS SKIPPED (TEMPLATE_NOT_CONFIGURED), Flowit not called', async () => {
  const saved = await banking.createVoucher(ssaVoucher(code(1)), meta);
  assert.ok(saved.id);
  assert.deepEqual(saved.sms, { status: 'SKIPPED', reason: 'TEMPLATE_NOT_CONFIGURED' });
  const rows = await smsRows(saved.id);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].status, rows[0].skipReason], ['SKIPPED', 'TEMPLATE_NOT_CONFIGURED']);
  assert.equal(flowitCalls.length, 0);
});

test('SMS unchecked: voucher saves, no sms_messages row, no Flowit request', async () => {
  await saveTemplate();
  const saved = await banking.createVoucher(ssaVoucher(code(1), { details: { sms: false } }), meta);
  assert.ok(saved.id);
  assert.equal(saved.sms, undefined);
  assert.equal((await smsRows(saved.id)).length, 0);
  assert.equal(flowitCalls.length, 0);
});

test('SMS checked + valid number: PENDING row committed with the voucher, then Flowit called, then SENT', async () => {
  await saveTemplate();
  let seenAtCall = null;
  onFlowitCall = async (call) => {
    // At the moment Flowit is called the voucher transaction has committed:
    // another connection sees the voucher and the claimed PENDING row.
    const row = (await db.query('SELECT * FROM "sms_messages" WHERE "id" = $1', [call.body.udf1])).rows[0];
    const voucher = (await db.query('SELECT "id" FROM "vouchers" WHERE "id" = $1', [row.voucherId])).rows[0];
    seenAtCall = { status: row.status, attempts: row.attempts, voucherCommitted: Boolean(voucher) };
  };
  const saved = await banking.createVoucher(ssaVoucher(code(1), { amount: 2500.5 }), meta);
  assert.deepEqual(saved.sms, { status: 'SENT' });
  assert.deepEqual(seenAtCall, { status: 'PENDING', attempts: 1, voucherCommitted: true });

  assert.equal(flowitCalls.length, 1);
  const call = flowitCalls[0];
  assert.equal(call.url, 'https://sms.flowitof.com/dev/bulkV2');
  assert.equal(call.headers.Authorization, API_KEY);
  assert.deepEqual(call.body, {
    sender_id: 'BANKRP', message: '111111', route: 'dlt', numbers: '9876543210',
    variables_values: `Member 1|2,500.50|${saved.voucherNo}|07-10-2026`,
    udf1: call.body.udf1, udf2: 'MEMBER_SSA_PAID'
  });

  const [row] = await smsRows(saved.id);
  assert.equal(row.status, 'SENT');
  assert.equal(row.idempotencyKey, `${saved.id}:MEMBER_SSA_PAID:${code(1)}`);
  assert.equal(row.maskedMobile, '98XXXXXX10');
  assert.equal(row.mobileHash, sms.hashMobile('9876543210'));
  assert.ok(row.providerRequestId.startsWith(`req-${RUN}`));
  assert.equal(row.entityCode, code(1));
  // Nothing stored that it must not hold: number, body, key.
  const stored = JSON.stringify(row);
  for (const secret of ['9876543210', API_KEY, 'Member 1|']) assert.equal(stored.includes(secret), false, `${secret} stored`);
});

test('a phone number sent by the frontend is ignored: the number comes from members.mobileNo', async () => {
  await saveTemplate();
  const saved = await banking.createVoucher(ssaVoucher(code(8), {
    mobileNo: '9000000001', numbers: '9000000001', details: { sms: true, mobileNo: '9000000001', numbers: '9000000001', senderId: 'HACKER', dltMessageId: '999' }
  }), meta);
  assert.deepEqual(saved.sms, { status: 'SENT' });
  assert.equal(flowitCalls.length, 1);
  assert.deepEqual([flowitCalls[0].body.numbers, flowitCalls[0].body.sender_id, flowitCalls[0].body.message], ['9845678901', 'BANKRP', '111111']);
});

test('SMS checked + no / invalid / placeholder number, dismembered or deleted member: voucher saves, SMS SKIPPED', async () => {
  await saveTemplate();
  const cases = [[2, 'NO_MOBILE'], [3, 'INVALID_MOBILE'], [4, 'PLACEHOLDER_MOBILE'], [5, 'MEMBER_DISMEMBERED'], [6, 'MEMBER_DELETED']];
  for (const [n, reason] of cases) {
    const saved = await banking.createVoucher(ssaVoucher(code(n)), meta);
    assert.ok(saved.id, `voucher for member ${n} saved`);
    assert.ok(await Voucher.findById(saved.id).lean());
    assert.deepEqual(saved.sms, { status: 'SKIPPED', reason }, `member ${n}`);
    const [row] = await smsRows(saved.id);
    assert.deepEqual([row.status, row.skipReason, row.maskedMobile, row.mobileHash], ['SKIPPED', reason, null, null]);
  }
  assert.equal(flowitCalls.length, 0);
});

test('SMS turned off globally, or the template disabled: SKIPPED, no Flowit call', async () => {
  await saveTemplate();
  setSmsEnv({ SMS_ENABLED: 'false' });
  const off = await banking.createVoucher(ssaVoucher(code(1)), meta);
  assert.deepEqual(off.sms, { status: 'SKIPPED', reason: 'SMS_DISABLED' });

  setSmsEnv({ FLOWIT_API_KEY: '' });
  const noKey = await banking.createVoucher(ssaVoucher(code(1)), meta);
  assert.deepEqual(noKey.sms, { status: 'SKIPPED', reason: 'PROVIDER_NOT_CONFIGURED' });

  setSmsEnv();
  await saveTemplate({ isEnabled: false });
  const disabled = await banking.createVoucher(ssaVoucher(code(1)), meta);
  assert.deepEqual(disabled.sms, { status: 'SKIPPED', reason: 'TEMPLATE_DISABLED' });
  assert.equal(flowitCalls.length, 0);
  await saveTemplate();
});

test('Flowit failure (416 wallet balance): voucher stays saved, SMS FAILED with the provider code', async () => {
  await saveTemplate();
  flowitReply = async () => ({ status: 400, body: { return: false, status_code: 416, message: "You don't have sufficient wallet balance" } });
  const saved = await banking.createVoucher(ssaVoucher(code(7)), meta);
  assert.deepEqual(saved.sms, { status: 'FAILED' });
  assert.ok(await Voucher.findById(saved.id).lean(), 'voucher kept');
  assert.ok((await JournalLine.find({ voucherId: saved.id }).lean()).length >= 2, 'journal kept');
  const [row] = await smsRows(saved.id);
  assert.deepEqual([row.status, row.errorCode, row.attempts], ['FAILED', '416', 1]);
  assert.match(row.errorMessage, /wallet balance/);
});

test('Flowit timeout: voucher saved, SMS FAILED (TIMEOUT), not retried automatically', async () => {
  await saveTemplate();
  setSmsEnv({ FLOWIT_TIMEOUT_MS: '50' });
  flowitReply = (_call, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const saved = await banking.createVoucher(ssaVoucher(code(7)), meta);
  assert.deepEqual(saved.sms, { status: 'FAILED' });
  const [row] = await smsRows(saved.id);
  assert.deepEqual([row.status, row.errorCode], ['FAILED', 'TIMEOUT']);
  flowitCalls.length = 0;
  await sms.dispatchPending();
  assert.equal(flowitCalls.filter((call) => call.body.udf1 === row.id).length, 0);
});

test('Flowit unreachable: SMS stays PENDING, the retry job sends it once the lease runs out', async () => {
  await saveTemplate();
  flowitReply = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); };
  const saved = await banking.createVoucher(ssaVoucher(code(9)), meta);
  assert.deepEqual(saved.sms, { status: 'PENDING' });
  const [row] = await smsRows(saved.id);
  assert.deepEqual([row.status, row.errorCode, row.attempts], ['PENDING', 'NETWORK', 1]);

  // Within the lease: not picked up again.
  flowitReply = async () => ({ status: 200, body: { return: true, request_id: `req-${RUN}-retry`, message: ['ok'] } });
  await sms.dispatchPending();
  assert.equal((await smsRows(saved.id))[0].status, 'PENDING');
  await db.query('UPDATE "sms_messages" SET "lastAttemptAt" = NOW() - INTERVAL \'10 minutes\' WHERE "id" = $1', [row.id]);
  await sms.dispatchPending();
  const [after] = await smsRows(saved.id);
  assert.deepEqual([after.status, after.attempts, after.providerRequestId], ['SENT', 2, `req-${RUN}-retry`]);
});

test('voucher transaction rollback: no voucher, no sms_messages row, no Flowit call', async () => {
  await saveTemplate();
  const before = (await smsRowsForMember(code(1))).length;
  const original = JournalLine.insertMany;
  // Fails after the voucher and its SMS row were written in the transaction.
  JournalLine.insertMany = async () => { throw new Error('simulated journal failure'); };
  try {
    await assert.rejects(banking.createVoucher(ssaVoucher(code(1), { narration: `${RUN}-rollback` }), meta), /simulated journal failure/);
  } finally {
    JournalLine.insertMany = original;
  }
  assert.equal((await db.query('SELECT 1 FROM "vouchers" WHERE "narration" = $1', [`${RUN}-rollback`])).rowCount, 0);
  assert.equal((await smsRowsForMember(code(1))).length, before);
  assert.equal(flowitCalls.length, 0);
});

test('edit: the original save sends once, editing (SMS still ticked) never sends again', async () => {
  await saveTemplate();
  const saved = await banking.createVoucher(ssaVoucher(code(1)), meta);
  assert.deepEqual(saved.sms, { status: 'SENT' });
  const edited = await banking.updateVoucher(saved.id, { ...ssaVoucher(code(1)), amount: 1750, narration: 'corrected' }, meta);
  assert.equal(edited.amount, 1750);
  assert.equal(edited.sms, undefined);
  // The documents-only update the form sends after a save.
  await banking.updateVoucher(saved.id, { documents: {} }, meta);
  assert.equal(flowitCalls.length, 1);
  assert.equal((await smsRows(saved.id)).length, 1);
});

test('edit: ticking SMS on a voucher saved without it sends once; unticking and ticking again does not resend', async () => {
  await saveTemplate();
  const saved = await banking.createVoucher(ssaVoucher(code(1), { details: { sms: false } }), meta);
  const ticked = await banking.updateVoucher(saved.id, ssaVoucher(code(1)), meta);
  assert.deepEqual(ticked.sms, { status: 'SENT' });
  await banking.updateVoucher(saved.id, ssaVoucher(code(1), { details: { sms: false } }), meta);
  const again = await banking.updateVoucher(saved.id, ssaVoucher(code(1)), meta);
  assert.equal(again.sms, undefined, 'idempotency key blocks a second row');
  assert.equal(flowitCalls.length, 1);
  assert.equal((await smsRows(saved.id)).length, 1);
});

test('duplicate queue for the same voucher is refused by the unique idempotency key', async () => {
  await saveTemplate();
  const saved = await banking.createVoucher(ssaVoucher(code(1)), meta);
  const voucher = await Voucher.findById(saved.id).lean();
  const client = await db.connect();
  try {
    assert.deepEqual(await sms.queueForVoucher(client, voucher, meta), []);
  } finally {
    client.release();
  }
  assert.equal((await smsRows(saved.id)).length, 1);
  // And the database itself refuses a second row with that key.
  await assert.rejects(db.query(
    'INSERT INTO "sms_messages" ("id", "createdAt", "updatedAt", "idempotencyKey", "status") VALUES (gen_random_uuid(), NOW(), NOW(), $1, \'PENDING\')',
    [`${saved.id}:MEMBER_SSA_PAID:${code(1)}`]
  ), /unique|duplicate/i);
});

test('security: a branch-scoped user selecting another branch\'s member gets 403, no voucher, no SMS', async () => {
  await saveTemplate();
  const before = (await smsRowsForMember(code(90))).length;
  await assert.rejects(
    banking.createVoucher(ssaVoucher(code(90), { narration: `${RUN}-cross-branch` }), meta),
    (error) => error.statusCode === 403 && /access to this member/.test(error.message)
  );
  assert.equal((await db.query('SELECT 1 FROM "vouchers" WHERE "narration" = $1', [`${RUN}-cross-branch`])).rowCount, 0);
  assert.equal((await smsRowsForMember(code(90))).length, before);
  assert.equal(flowitCalls.length, 0);

  // Editing an own-branch voucher over to the other branch's member: refused too.
  const own = await banking.createVoucher(ssaVoucher(code(1), { details: { sms: false } }), meta);
  await assert.rejects(banking.updateVoucher(own.id, ssaVoucher(code(90)), meta), (error) => error.statusCode === 403);
  assert.equal((await Voucher.findById(own.id).lean()).partyCode, code(1));

  // Another branch's user cannot edit this branch's voucher at all ("not found").
  const otherUser = { id: null, branchCode: OTHER_BRANCH, isSuperAdmin: false };
  assert.equal(await banking.updateVoucher(own.id, { narration: 'x' }, { actorUser: otherUser }), null);

  // A super admin may post for any branch's member.
  const admin = await banking.createVoucher(ssaVoucher(code(90), { details: { sms: false } }), { actorUser: { isSuperAdmin: true } });
  assert.ok(admin.id);
});

async function postWebhook(body, headers = {}) {
  const response = await realFetch(`${baseUrl}/sms/flowit/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

test('webhook: wrong or missing secret rejected; delivered and failed reports update the right row', async () => {
  await saveTemplate();
  const a = await banking.createVoucher(ssaVoucher(code(1)), meta);
  const b = await banking.createVoucher(ssaVoucher(code(8)), meta);
  const [rowA] = await smsRows(a.id);
  const [rowB] = await smsRows(b.id);
  const report = (row, mobile, status, extra = {}) => ({
    request_id: row.providerRequestId, mobile, status, status_description: status, udf1: row.id, udf2: 'MEMBER_SSA_PAID',
    delivery_timestamp: 1791360000, failure_reason: extra.failure_reason || '', webhook_type: 'status_update', ...extra
  });

  assert.equal((await postWebhook(report(rowA, '9876543210', 'Delivered'))).status, 401);
  assert.equal((await postWebhook(report(rowA, '9876543210', 'Delivered'), { 'x-webhook-secret': 'wrong' })).status, 401);
  assert.equal((await smsRows(a.id))[0].status, 'SENT');

  // Same row id but a different number or request id: ignored.
  const mismatch = await postWebhook([
    report(rowA, '9000000001', 'Failed'),
    { ...report(rowA, '9876543210', 'Failed'), request_id: 'someone-else' }
  ], { 'x-webhook-secret': WEBHOOK_SECRET });
  assert.deepEqual(mismatch.body.data, { updated: 0, ignored: 0, unmatched: 0, mismatch: 2 });
  assert.equal((await smsRows(a.id))[0].status, 'SENT');

  const ok = await postWebhook([
    report(rowA, '9876543210', 'Delivered'),
    // Found by request_id alone (no udf1).
    { ...report(rowB, '9845678901', 'Failed', { failure_reason: 'Number switched off' }), udf1: '' },
    { request_id: 'unknown', mobile: '9876543210', status: 'Delivered' }
  ], { 'x-webhook-secret': WEBHOOK_SECRET });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.data, { updated: 2, ignored: 0, unmatched: 1, mismatch: 0 });
  const [deliveredA] = await smsRows(a.id);
  assert.equal(deliveredA.status, 'DELIVERED');
  assert.equal(new Date(deliveredA.deliveredAt).getTime(), 1791360000 * 1000);
  const [failedB] = await smsRows(b.id);
  assert.deepEqual([failedB.status, failedB.errorCode, failedB.errorMessage], ['FAILED', 'DLR_FAILED', 'Number switched off']);

  // A final status is not overwritten by a late interim one.
  await postWebhook(report(rowA, '9876543210', 'Sent'), { 'x-webhook-secret': WEBHOOK_SECRET });
  assert.equal((await smsRows(a.id))[0].status, 'DELIVERED');

  setSmsEnv({ FLOWIT_WEBHOOK_SECRET: '' });
  assert.equal((await postWebhook(report(rowA, '9876543210', 'Delivered'), { 'x-webhook-secret': '' })).status, 503);
});

test('no full number or API key in anything logged while sending', async () => {
  await saveTemplate();
  const lines = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  for (const name of Object.keys(original)) console[name] = (...args) => lines.push(args.map(String).join(' '));
  try {
    flowitReply = async () => ({ status: 401, body: { return: false, status_code: 412, message: 'Invalid Authentication, Check Authorization Key' } });
    await banking.createVoucher(ssaVoucher(code(1)), meta);
    setSmsEnv({ FLOWIT_API_KEY: '' });
    await banking.createVoucher(ssaVoucher(code(1)), meta);
  } finally {
    Object.assign(console, original);
  }
  const output = lines.join('\n');
  assert.ok(output.includes('98XXXXXX10'), 'logs use the masked number');
  assert.equal(output.includes('9876543210'), false);
  assert.equal(output.includes(API_KEY), false);
});
