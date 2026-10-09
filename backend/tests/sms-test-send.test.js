// Temporary Flowit connectivity test: POST /api/sms/test-send.
//
// Everything (sender, DLT message id, number, OTP) comes from the backend
// environment; the browser cannot override any of it. One SMS per minute at
// most, never retried automatically, logged in sms_messages as
// FLOWIT_TEST_OTP and updated by the existing delivery webhook. Flowit is
// stubbed: no real SMS is sent. Uses its own database (bank_sms_testsend_test).
process.env.PG_DATABASE = process.env.SMS_TESTSEND_TEST_DATABASE || 'bank_sms_testsend_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const sms = require('../services/sms/sms.service');
const smsController = require('../controllers/sms.controller');
const { initializeDatabase, closeDatabase } = require('../config/postgres');

const API_KEY = 'testsend-flowit-key-3e9b10';
const WEBHOOK_SECRET = 'testsend-webhook-secret-a71c';
const TEST_MOBILE = '+91 98712 34560';
const TEST_MOBILE_DIGITS = '9871234560';
const SENDER = 'JCBEXC';
const MESSAGE_ID = '987654';
const OTP = '180589';

const USERS = {
  admin: { id: null, isSuperAdmin: true, permissions: [] },
  writer: { id: null, isSuperAdmin: false, branchCode: '', permissions: ['settings.read', 'settings.write'] },
  reader: { id: null, isSuperAdmin: false, branchCode: '', permissions: ['settings.read'] }
};

const realFetch = globalThis.fetch;
const flowitCalls = [];
let flowitReply;
let db;
let server;
let baseUrl;

function setEnv(overrides = {}) {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    SMS_ENABLED: 'true',
    FLOWIT_BASE_URL: 'https://sms.flowitof.com',
    FLOWIT_API_KEY: API_KEY,
    FLOWIT_SENDER_ID: 'BANKRP',
    FLOWIT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    FLOWIT_WEBHOOK_HEADER: 'x-webhook-secret',
    FLOWIT_TIMEOUT_MS: '2000',
    FLOWIT_TEST_SENDER_ID: SENDER,
    FLOWIT_TEST_MESSAGE_ID: MESSAGE_ID,
    FLOWIT_TEST_MOBILE: TEST_MOBILE,
    FLOWIT_TEST_OTP: OTP,
    FLOWIT_TEST_ALLOW_IN_PRODUCTION: '',
    ...overrides
  });
}

async function call(method, path, { user = 'writer', body, headers = {} } = {}) {
  const response = await realFetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-user': user, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return { status: response.status, text, body: text ? JSON.parse(text) : null };
}

const sendTest = (body = {}, user = 'writer') => call('POST', '/sms/test-send', { user, body });

async function testRows() {
  return (await db.query('SELECT * FROM "sms_messages" WHERE "eventCode" = $1 ORDER BY "createdAt"', ['FLOWIT_TEST_OTP'])).rows;
}

// Moves earlier test sends out of the cooldown window (and their minute
// bucket), as if a minute had passed.
async function endCooldown() {
  await db.query(
    `UPDATE "sms_messages" SET "createdAt" = "createdAt" - INTERVAL '2 minutes', "idempotencyKey" = "idempotencyKey" || ':' || "id"
     WHERE "eventCode" = 'FLOWIT_TEST_OTP' AND "createdAt" > NOW() - INTERVAL '2 minutes'`
  );
}

test.before(async () => {
  setEnv();
  db = await initializeDatabase();
  await db.query('DELETE FROM "sms_messages" WHERE "eventCode" = $1', ['FLOWIT_TEST_OTP']);
  globalThis.fetch = async (url, options = {}) => {
    if (!String(url).startsWith('https://sms.flowitof.com/')) return realFetch(url, options);
    const callInfo = { url: String(url), headers: options.headers, body: JSON.parse(options.body) };
    flowitCalls.push(callInfo);
    const reply = await flowitReply(callInfo);
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
  };
  const app = express();
  app.use(express.json());
  app.post('/api/sms/flowit/webhook', smsController.flowitWebhookController);
  app.use((req, _res, next) => {
    req.user = USERS[req.get('x-test-user')] || null;
    next();
  });
  app.use('/api/sms', require('../routes/sms.routes'));
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

test.beforeEach(async () => {
  flowitCalls.length = 0;
  flowitReply = async () => ({ status: 200, body: { return: true, request_id: `req-${Math.random().toString(36).slice(2, 10)}`, message: ['Message sent successfully'] } });
  setEnv();
  await endCooldown();
});

function assertNoSecrets(text) {
  for (const secret of [API_KEY, WEBHOOK_SECRET, TEST_MOBILE_DIGITS, SENDER, MESSAGE_ID, OTP]) {
    assert.equal(text.includes(secret), false, `"${secret}" must not be in the response`);
  }
}

test('needs a signed-in user with settings.write', async () => {
  assert.equal((await sendTest({}, 'nobody')).status, 401);
  assert.equal((await sendTest({}, 'reader')).status, 403);
  assert.equal(flowitCalls.length, 0);
  assert.equal((await testRows()).length, 0);
});

test('missing configuration: 400 naming what is missing, no send, no row, no values', async () => {
  setEnv({ SMS_ENABLED: 'false', FLOWIT_API_KEY: '', FLOWIT_WEBHOOK_SECRET: '', FLOWIT_TEST_SENDER_ID: '', FLOWIT_TEST_MESSAGE_ID: '', FLOWIT_TEST_MOBILE: '', FLOWIT_BASE_URL: 'http://sms.flowitof.com' });
  const response = await sendTest();
  assert.equal(response.status, 400);
  const problems = response.body.problems.join(' ');
  for (const name of ['SMS_ENABLED', 'FLOWIT_API_KEY', 'FLOWIT_BASE_URL', 'FLOWIT_WEBHOOK_SECRET', 'FLOWIT_TEST_SENDER_ID', 'FLOWIT_TEST_MESSAGE_ID', 'FLOWIT_TEST_MOBILE']) {
    assert.match(problems, new RegExp(name), name);
  }
  assert.equal(flowitCalls.length, 0);
  assert.equal((await testRows()).length, 0);

  // Each one alone also blocks the send.
  for (const missing of ['FLOWIT_TEST_SENDER_ID', 'FLOWIT_TEST_MESSAGE_ID', 'FLOWIT_TEST_MOBILE', 'FLOWIT_API_KEY', 'FLOWIT_WEBHOOK_SECRET']) {
    setEnv({ [missing]: '' });
    const one = await sendTest();
    assert.equal(one.status, 400, missing);
    assert.deepEqual(one.body.problems.length, 1, missing);
  }
  assert.equal(flowitCalls.length, 0);
});

test('invalid test number or OTP: 400, no send', async () => {
  for (const [mobile, otp] of [['12345', OTP], ['+911212121212', OTP], ['9999999999', OTP], [TEST_MOBILE, 'abc'], [TEST_MOBILE, '123456789012']]) {
    setEnv({ FLOWIT_TEST_MOBILE: mobile, FLOWIT_TEST_OTP: otp });
    const response = await sendTest();
    assert.equal(response.status, 400, `${mobile} / ${otp}`);
    assertNoSecrets(response.text.replace(/180589/g, ''));
  }
  assert.equal(flowitCalls.length, 0);
});

test('production: refused unless FLOWIT_TEST_ALLOW_IN_PRODUCTION=true, and the OTP must then be set', async () => {
  setEnv({ NODE_ENV: 'production' });
  const refused = await sendTest();
  assert.equal(refused.status, 400);
  assert.match(refused.body.problems.join(' '), /FLOWIT_TEST_ALLOW_IN_PRODUCTION/);
  setEnv({ NODE_ENV: 'production', FLOWIT_TEST_ALLOW_IN_PRODUCTION: 'true', FLOWIT_TEST_OTP: '' });
  const noOtp = await sendTest();
  assert.equal(noOtp.status, 400);
  assert.match(noOtp.body.problems.join(' '), /FLOWIT_TEST_OTP is not set/);
  assert.equal(flowitCalls.length, 0);
  // Outside production the default test value is used.
  setEnv({ FLOWIT_TEST_OTP: '' });
  assert.equal((await sendTest()).status, 200);
  assert.equal(flowitCalls[0].body.variables_values, '180589');
});

test('success: exact payload from the environment; browser overrides ignored; SENT with request id', async () => {
  flowitReply = async () => ({ status: 200, body: { return: true, request_id: 'req-test-0001', message: ['Message sent successfully'] } });
  const response = await sendTest({
    mobile: '9123456789', numbers: '9123456789', senderId: 'HACKED', sender_id: 'HACKED', messageId: '111', message: '111', otp: '000000', variables_values: 'x'
  });
  assert.equal(response.status, 200);
  assert.equal(flowitCalls.length, 1);
  const [flowit] = flowitCalls;
  assert.equal(flowit.url, 'https://sms.flowitof.com/dev/bulkV2');
  assert.equal(flowit.headers.Authorization, API_KEY);
  assert.equal(flowit.headers['Content-Type'], 'application/json');
  const row = (await db.query('SELECT * FROM "sms_messages" WHERE "id" = $1', [response.body.data.id])).rows[0];
  assert.deepEqual(flowit.body, {
    sender_id: SENDER, message: MESSAGE_ID, variables_values: OTP, route: 'dlt', numbers: TEST_MOBILE_DIGITS, udf1: row.id, udf2: 'FLOWIT_TEST_OTP'
  });

  assert.deepEqual(
    { status: response.body.data.status, providerRequestId: response.body.data.providerRequestId, maskedMobile: response.body.data.maskedMobile, eventCode: response.body.data.eventCode },
    { status: 'SENT', providerRequestId: 'req-test-0001', maskedMobile: '98XXXXXX60', eventCode: 'FLOWIT_TEST_OTP' }
  );
  assertNoSecrets(response.text);

  // The log row: masked number and hash only, no OTP, no message, no voucher.
  assert.deepEqual(
    [row.status, row.entityType, row.provider, row.providerRequestId, row.attempts, row.maskedMobile, row.voucherId],
    ['SENT', 'SYSTEM_TEST', 'flowit', 'req-test-0001', 1, '98XXXXXX60', null]
  );
  const { mobileHash, ...columns } = row;
  assert.equal(mobileHash.length, 64);
  for (const [column, value] of Object.entries(columns)) {
    assert.equal(String(value ?? '').includes(TEST_MOBILE_DIGITS), false, `${column} holds the number`);
    assert.equal(String(value ?? '').includes(OTP), false, `${column} holds the OTP`);
  }
});

test('cooldown: a second send within 60 s is refused; rapid concurrent clicks send once', async () => {
  assert.equal((await sendTest()).status, 200);
  const again = await sendTest();
  assert.equal(again.status, 429);
  assert.match(again.body.message, /less than 60 seconds ago/);
  assert.ok(again.body.retryAfterSeconds > 0 && again.body.retryAfterSeconds <= 60);
  assert.equal(flowitCalls.length, 1);

  await endCooldown();
  flowitCalls.length = 0;
  const burst = await Promise.all([sendTest(), sendTest(), sendTest(), sendTest()]);
  assert.deepEqual(burst.map((r) => r.status).sort(), [200, 429, 429, 429]);
  assert.equal(flowitCalls.length, 1);
});

test('Flowit rejects: FAILED with the safe provider code, never retried by the retry job', async () => {
  flowitReply = async () => ({ status: 400, body: { return: false, status_code: 424, message: 'Invalid Message ID' } });
  const response = await sendTest();
  assert.equal(response.status, 200);
  assert.deepEqual([response.body.data.status, response.body.data.errorCode, response.body.data.errorMessage], ['FAILED', '424', 'Invalid Message ID']);
  assertNoSecrets(response.text);

  // Could not connect: also FAILED at once (a manual test is not retried).
  await endCooldown();
  flowitReply = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); };
  const unreachable = await sendTest();
  assert.deepEqual([unreachable.body.data.status, unreachable.body.data.errorCode], ['FAILED', 'NETWORK']);
  await db.query('UPDATE "sms_messages" SET "lastAttemptAt" = NOW() - INTERVAL \'10 minutes\' WHERE "eventCode" = \'FLOWIT_TEST_OTP\'');
  flowitCalls.length = 0;
  flowitReply = async () => ({ status: 200, body: { return: true, request_id: 'must-not-happen' } });
  await sms.dispatchPending();
  assert.equal(flowitCalls.length, 0);
});

test('webhook: the test row moves SENT -> DELIVERED by udf1, or FAILED by request_id; never by number alone', async () => {
  const headers = { 'x-webhook-secret': WEBHOOK_SECRET };
  flowitReply = async () => ({ status: 200, body: { return: true, request_id: 'req-test-dlr-1', message: ['ok'] } });
  const first = (await sendTest()).body.data;
  // Number alone matches nothing.
  const byNumber = await call('POST', '/sms/flowit/webhook', { body: { mobile: TEST_MOBILE_DIGITS, status: 'Delivered' }, headers });
  assert.deepEqual(byNumber.body.data, { updated: 0, ignored: 0, unmatched: 1, mismatch: 0 });
  const delivered = await call('POST', '/sms/flowit/webhook', { body: { request_id: 'req-test-dlr-1', udf1: first.id, udf2: 'FLOWIT_TEST_OTP', mobile: TEST_MOBILE_DIGITS, status: 'Delivered', delivery_timestamp: 1791360000 }, headers });
  assert.deepEqual(delivered.body.data, { updated: 1, ignored: 0, unmatched: 0, mismatch: 0 });
  // A late failure does not downgrade it.
  await call('POST', '/sms/flowit/webhook', { body: { request_id: 'req-test-dlr-1', udf1: first.id, status: 'Failed' }, headers });
  assert.equal((await db.query('SELECT "status" FROM "sms_messages" WHERE "id" = $1', [first.id])).rows[0].status, 'DELIVERED');

  await endCooldown();
  flowitReply = async () => ({ status: 200, body: { return: true, request_id: 'req-test-dlr-2', message: ['ok'] } });
  const second = (await sendTest()).body.data;
  const failed = await call('POST', '/sms/flowit/webhook', { body: { request_id: 'req-test-dlr-2', mobile: TEST_MOBILE_DIGITS, status: 'Failed', failure_reason: 'DND' }, headers });
  assert.equal(failed.body.data.updated, 1);
  const row = (await db.query('SELECT * FROM "sms_messages" WHERE "id" = $1', [second.id])).rows[0];
  assert.deepEqual([row.status, row.errorCode, row.errorMessage], ['FAILED', 'DLR_FAILED', 'DND']);
});

test('config status: test flags and masked number only; the log lists the test rows', async () => {
  const status = await call('GET', '/sms/config/status', { user: 'reader' });
  assert.equal(status.status, 200);
  assert.deepEqual(status.body.data.test, {
    eventCode: 'FLOWIT_TEST_OTP', senderConfigured: true, templateConfigured: true, mobileConfigured: true, mobileValid: true,
    maskedMobile: '98XXXXXX60', allowedHere: true, cooldownSeconds: 60, ready: true, problems: []
  });
  assertNoSecrets(status.text.replace('"senderId":"BANKRP"', ''));

  setEnv({ FLOWIT_TEST_MOBILE: '12345', FLOWIT_TEST_SENDER_ID: '' });
  const incomplete = (await call('GET', '/sms/config/status', { user: 'reader' })).body.data.test;
  assert.deepEqual([incomplete.senderConfigured, incomplete.mobileConfigured, incomplete.mobileValid, incomplete.maskedMobile, incomplete.ready], [false, true, false, '', false]);

  const log = await call('GET', '/sms/messages?eventCode=FLOWIT_TEST_OTP', { user: 'reader' });
  assert.ok(log.body.data.length > 0);
  assert.ok(log.body.data.every((row) => row.entityType === 'SYSTEM_TEST' && row.maskedMobile === '98XXXXXX60'));
  assertNoSecrets(log.text.replace(/"senderId":"BANKRP"/g, ''));
});

test('isolated from the banking events: no template, no voucher trigger, cannot be edited', async () => {
  assert.equal(Object.hasOwn(sms.SMS_EVENTS, 'FLOWIT_TEST_OTP'), false);
  assert.equal(Object.values(sms.EVENT_BY_VOUCHER_KEY).includes('FLOWIT_TEST_OTP'), false);
  const templates = await call('GET', '/sms/templates', { user: 'reader' });
  assert.deepEqual(templates.body.data.map((t) => t.eventCode), ['MEMBER_LOAN_PAID', 'MEMBER_CD_PAID', 'MEMBER_INSURANCE_PAID', 'MEMBER_SSA_PAID']);
  assert.equal((await call('PUT', '/sms/templates/FLOWIT_TEST_OTP', { body: { dltMessageId: '1', isEnabled: true } })).status, 400);
  // Queueing a voucher never produces a test row.
  assert.deepEqual(await sms.queueForVoucher(null, { id: 'v', partyCode: 'X', details: { key: 'flowit-test', sms: true } }), []);
});

test('a numeric sender ID (e.g. 5 digits) is accepted; malformed ones are refused', async () => {
  setEnv({ FLOWIT_TEST_SENDER_ID: '54321' });
  const response = await sendTest();
  assert.equal(response.status, 200);
  assert.equal(flowitCalls.at(-1).body.sender_id, '54321');
  for (const bad of ['12', 'AB-12', '123456789012']) {
    await endCooldown();
    setEnv({ FLOWIT_TEST_SENDER_ID: bad });
    const refused = await sendTest();
    assert.equal(refused.status, 400, bad);
    assert.match(refused.body.problems.join(' '), /3 to 11 letters or digits/);
  }
});
