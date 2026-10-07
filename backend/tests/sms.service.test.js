// SMS unit tests: mobile normalisation and masking, template variables, and
// the Flowit provider against a mocked fetch (no network, no database).
const test = require('node:test');
const assert = require('node:assert/strict');
const sms = require('../services/sms/sms.service');
const flowit = require('../services/sms/flowit.provider');

const API_KEY = 'unit-test-flowit-key-7f3a9c';

function withEnv(values, fn) {
  const saved = {};
  for (const key of Object.keys(values)) {
    saved[key] = process.env[key];
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  const restore = () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  return Promise.resolve().then(fn).finally(restore);
}

// Records every console line written while fn runs.
async function captureConsole(fn) {
  const lines = [];
  const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const name of Object.keys(original)) console[name] = (...args) => lines.push(args.map(String).join(' '));
  try {
    const result = await fn();
    return { result, output: lines.join('\n') };
  } finally {
    Object.assign(console, original);
  }
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

const message = { senderId: 'BANKRP', messageId: '111111', variables: ['RAM KUMAR', '1,500.00', '42', '07-10-2026'], numbers: ['9876543210'], udf1: 'row-id', udf2: 'MEMBER_SSA_PAID' };

test('mobile: +91, 91-prefixed, 0-prefixed and plain 10-digit numbers normalise to 10 digits', () => {
  assert.deepEqual(sms.normalizeMobile('+919876543210'), { mobile: '9876543210', reason: '' });
  assert.deepEqual(sms.normalizeMobile('919876543210'), { mobile: '9876543210', reason: '' });
  assert.deepEqual(sms.normalizeMobile('09876543210'), { mobile: '9876543210', reason: '' });
  assert.deepEqual(sms.normalizeMobile('9876543210'), { mobile: '9876543210', reason: '' });
  assert.deepEqual(sms.normalizeMobile('+91 98765-43210'), { mobile: '9876543210', reason: '' });
});

test('mobile: empty, invalid and placeholder numbers are refused with a reason', () => {
  assert.equal(sms.normalizeMobile('').reason, 'NO_MOBILE');
  assert.equal(sms.normalizeMobile(null).reason, 'NO_MOBILE');
  assert.equal(sms.normalizeMobile('+').reason, 'NO_MOBILE');
  assert.equal(sms.normalizeMobile('+911212121212').reason, 'INVALID_MOBILE'); // the real placeholder: starts with 1
  assert.equal(sms.normalizeMobile('5876543210').reason, 'INVALID_MOBILE');
  assert.equal(sms.normalizeMobile('98765').reason, 'INVALID_MOBILE');
  assert.equal(sms.normalizeMobile('+1 202 555 0143').reason, 'INVALID_MOBILE');
  assert.equal(sms.normalizeMobile('9999999999').reason, 'PLACEHOLDER_MOBILE');
  assert.equal(sms.normalizeMobile('+919898989898').reason, 'PLACEHOLDER_MOBILE');
});

test('masking keeps only the first and last two digits; the hash is keyed and stable', () => {
  assert.equal(sms.maskMobile('9876543210'), '98XXXXXX10');
  assert.equal(sms.maskMobile(''), '');
  const hash = sms.hashMobile('9876543210');
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(sms.hashMobile('9876543210'), hash);
  assert.notEqual(sms.hashMobile('9876543211'), hash);
  assert.notEqual(hash, require('crypto').createHash('sha256').update('9876543210').digest('hex'));
});

test('template variables: template order, formatted, capped, and an unknown key refused', () => {
  const values = sms.buildVariables(['memberName', 'amount', 'voucherNo', 'date'], {
    voucher: { amount: 150000.5, voucherNo: '42', date: '2026-10-07' },
    member: { name: 'A VERY LONG MEMBER NAME THAT GOES PAST THIRTY CHARS', code: 'M1' }
  });
  assert.deepEqual(values, ['A VERY LONG MEMBER NAME THAT G', '1,50,000.50', '42', '07-10-2026']);
  assert.throws(() => sms.buildVariables(['balance'], { voucher: {}, member: {} }), /not available/);
  assert.equal(flowit.joinVariables(['A|B', 'line\nbreak', 3]), 'A/B|line break|3');
});

test('Flowit success: the documented request is sent and request_id returned', async () => {
  await withEnv({ FLOWIT_API_KEY: API_KEY, FLOWIT_BASE_URL: 'https://sms.flowitof.com' }, async () => {
    let call;
    const result = await flowit.send(message, {
      fetchImpl: async (url, options) => {
        call = { url, options };
        return jsonResponse(200, { return: true, request_id: 'lwdtp7cjyqxvfe9', message: ['Message sent successfully'] });
      }
    });
    assert.deepEqual({ success: result.success, requestId: result.requestId }, { success: true, requestId: 'lwdtp7cjyqxvfe9' });
    assert.equal(call.url, 'https://sms.flowitof.com/dev/bulkV2');
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.headers.Authorization, API_KEY); // no "Bearer" prefix
    assert.equal(call.options.headers['Content-Type'], 'application/json');
    assert.ok(call.options.signal, 'request carries an abort signal for the timeout');
    assert.deepEqual(JSON.parse(call.options.body), {
      sender_id: 'BANKRP', message: '111111', variables_values: 'RAM KUMAR|1,500.00|42|07-10-2026',
      route: 'dlt', numbers: '9876543210', udf1: 'row-id', udf2: 'MEMBER_SSA_PAID'
    });
  });
});

test('Flowit errors map to their documented codes: 400 / 401 / 416 / 995', async () => {
  await withEnv({ FLOWIT_API_KEY: API_KEY }, async () => {
    const cases = [
      [400, { return: false, status_code: 411, message: 'Invalid Numbers' }, '411', /Invalid Numbers/],
      [401, { return: false, status_code: 412, message: 'Invalid Authentication, Check Authorization Key' }, '412', /Check Authorization Key/],
      [400, { return: false, status_code: 416, message: "You don't have sufficient wallet balance" }, '416', /wallet balance/],
      [400, { return: false, status_code: 995, message: 'Spamming detected' }, '995', /Spamming/]
    ];
    for (const [status, body, code, text] of cases) {
      const result = await flowit.send(message, { fetchImpl: async () => jsonResponse(status, body) });
      assert.equal(result.success, false);
      assert.equal(result.errorCode, code);
      assert.equal(result.httpStatus, status);
      assert.match(result.message, text);
      assert.equal(result.retryable, false, `${code} is not retried`);
    }
    // No documented code in the body: the HTTP status, and a 5xx may pass.
    const http500 = await flowit.send(message, { fetchImpl: async () => jsonResponse(500, null) });
    assert.deepEqual([http500.errorCode, http500.retryable], ['HTTP_500', true]);
    const plain400 = await flowit.send(message, { fetchImpl: async () => jsonResponse(400, { message: 'Bad request' }) });
    assert.deepEqual([plain400.errorCode, plain400.message, plain400.retryable], ['HTTP_400', 'Bad request', false]);
  });
});

test('Flowit timeout aborts the request and is not retried (it may have been sent)', async () => {
  await withEnv({ FLOWIT_API_KEY: API_KEY, FLOWIT_TIMEOUT_MS: '30' }, async () => {
    const started = Date.now();
    const result = await flowit.send(message, {
      fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      })
    });
    assert.ok(Date.now() - started < 2000);
    assert.deepEqual([result.success, result.errorCode, result.retryable], [false, 'TIMEOUT', false]);
  });
});

test('Flowit unreachable is retryable; missing key, sender or message id never calls Flowit', async () => {
  await withEnv({ FLOWIT_API_KEY: API_KEY }, async () => {
    const refused = await flowit.send(message, { fetchImpl: async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); } });
    assert.deepEqual([refused.errorCode, refused.retryable], ['NETWORK', true]);
    let called = false;
    const fetchImpl = async () => { called = true; return jsonResponse(200, { return: true, request_id: 'x' }); };
    assert.equal((await flowit.send({ ...message, senderId: '' }, { fetchImpl })).errorCode, 'CONFIG');
    assert.equal((await flowit.send({ ...message, messageId: '' }, { fetchImpl })).errorCode, 'CONFIG');
    assert.equal((await flowit.send({ ...message, numbers: ['+919876543210'] }, { fetchImpl })).errorCode, 'INVALID_NUMBER');
    assert.equal(called, false);
  });
  await withEnv({ FLOWIT_API_KEY: undefined }, async () => {
    assert.equal((await flowit.send(message, { fetchImpl: async () => assert.fail('must not call') })).errorCode, 'CONFIG');
  });
});

test('the API key and the full number never appear in results or logs', async () => {
  await withEnv({ FLOWIT_API_KEY: API_KEY }, async () => {
    const { result, output } = await captureConsole(async () => [
      await flowit.send(message, { fetchImpl: async () => jsonResponse(401, { status_code: 412, message: `bad key ${API_KEY}` }) }),
      await flowit.send(message, { fetchImpl: async () => { throw new Error('boom'); } }),
      await flowit.send(message, { fetchImpl: async () => jsonResponse(200, { return: true, request_id: 'r1' }) })
    ]);
    const text = JSON.stringify(result) + output;
    assert.equal(text.includes(API_KEY), false, 'API key leaked');
    assert.equal(text.includes('9876543210'), false, 'full number leaked');
  });
});
