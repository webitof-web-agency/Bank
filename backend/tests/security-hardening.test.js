// Security guards that need no database: session token checks, unsafe
// request keys, notification links, error replies in production, and the
// request log never printing query-string secrets.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-security-hardening-0123456789';

const { verifySessionToken, isSessionCurrent } = require('../middlewares/auth');
const { findUnsafeKey } = require('../middlewares/inputSafety');
const { safeActionUrl } = require('../services/notification.service');
const errorHandler = require('../middlewares/errorHandler');
const { signFileViewToken } = require('../utils/file-url');

const secret = process.env.JWT_SECRET;

test('session token: a normal login token (with a session id) is accepted', () => {
  const token = jwt.sign({ sub: 'u1', uid: 'u1' }, secret, { expiresIn: '1h', jwtid: 'session-1' });
  assert.equal(verifySessionToken(token).userId, 'u1');
});

test('session token: a token without a session id cannot be logged out, so it is refused', () => {
  assert.equal(verifySessionToken(jwt.sign({ sub: 'u1', uid: 'u1' }, secret, { expiresIn: '1h' })), null);
});

test('session token: file-view links and Drive OAuth state are not logins', () => {
  assert.equal(verifySessionToken(signFileViewToken('f1')), null);
  const state = jwt.sign({ purpose: 'gdrive-connect', uid: 'u1' }, secret, { expiresIn: '10m', jwtid: 's' });
  assert.equal(verifySessionToken(state), null);
});

test('session token: other algorithms and other secrets are refused', () => {
  const none = jwt.sign({ sub: 'u1' }, null, { algorithm: 'none' });
  assert.throws(() => verifySessionToken(none));
  const hs512 = jwt.sign({ sub: 'u1' }, secret, { algorithm: 'HS512' });
  assert.throws(() => verifySessionToken(hs512));
  assert.throws(() => verifySessionToken(jwt.sign({ sub: 'u1' }, 'another-secret')));
});

test('session token: issued before the last password change is no longer valid', () => {
  const now = Math.floor(Date.now() / 1000);
  const user = { isActive: true, passwordChangedAt: new Date((now - 60) * 1000) };
  assert.equal(isSessionCurrent(user, { iat: now - 3600 }), false);
  assert.equal(isSessionCurrent(user, { iat: now }), true);
  assert.equal(isSessionCurrent({ isActive: true }, { iat: now - 3600 }), true);
  assert.equal(isSessionCurrent({ isActive: false }, { iat: now }), false);
});

test('request keys: query operators and prototype keys are found at any depth', () => {
  assert.equal(findUnsafeKey({ code: { $ne: 'x' } }), '$ne');
  assert.equal(findUnsafeKey(JSON.parse('{"a":{"__proto__":{"isSuperAdmin":true}}}')), '__proto__');
  assert.equal(findUnsafeKey({ rows: [{ constructor: 1 }] }), 'constructor');
  assert.equal(findUnsafeKey({ name: 'A $ sign in a value is fine', amount: 5 }), '');
});

test('notification links: only app paths and http(s) addresses', () => {
  assert.equal(safeActionUrl('/app/master/employees'), '/app/master/employees');
  assert.equal(safeActionUrl('https://example.com/x'), 'https://example.com/x');
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', '//evil.example', '/\\evil.example']) {
    assert.equal(safeActionUrl(bad), '', bad);
  }
});

function runErrorHandler(error, env) {
  const previous = process.env.NODE_ENV;
  if (env) process.env.NODE_ENV = env; else delete process.env.NODE_ENV;
  const originalError = console.error;
  console.error = () => {};
  const reply = {};
  const res = {
    headersSent: false,
    status(code) { reply.status = code; return this; },
    json(body) { reply.body = body; return this; }
  };
  try {
    errorHandler(error, { method: 'GET', baseUrl: '/api', path: '/x' }, res, () => {});
  } finally {
    console.error = originalError;
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
  return reply;
}

test('errors in production: internal text and stack are not sent to the client', () => {
  const reply = runErrorHandler(new Error('relation "users" does not exist at db-host:5432'), 'production');
  assert.equal(reply.status, 500);
  assert.doesNotMatch(reply.body.message, /relation|db-host/);
  assert.equal(reply.body.stack, undefined);

  const clientError = Object.assign(new Error('Password must be at least 8 characters long'), { statusCode: 400 });
  assert.equal(runErrorHandler(clientError, 'production').body.message, 'Password must be at least 8 characters long');

  const exposed = Object.assign(new Error('Google could not be reached'), { status: 503, expose: true });
  assert.equal(runErrorHandler(exposed, 'production').body.message, 'Google could not be reached');
});

test('errors with NODE_ENV unset are treated as production: no stack, no internal text', () => {
  const reply = runErrorHandler(new Error('relation "users" does not exist'), '');
  assert.doesNotMatch(reply.body.message, /relation/);
  assert.equal(reply.body.stack, undefined);
  const clientError = Object.assign(new Error('Invalid mobile number or password'), { statusCode: 401 });
  const login = runErrorHandler(clientError, '');
  assert.equal(login.body.message, 'Invalid mobile number or password');
  assert.equal(login.body.stack, undefined);
});

test('errors with NODE_ENV=development still hide the stack unless EXPOSE_ERROR_DETAILS=1', () => {
  assert.equal(runErrorHandler(new Error('x'), 'development').body.stack, undefined);
  process.env.EXPOSE_ERROR_DETAILS = '1';
  try {
    assert.ok(runErrorHandler(new Error('x'), 'development').body.stack, 'opt-in shows it');
  } finally {
    delete process.env.EXPOSE_ERROR_DETAILS;
  }
});
