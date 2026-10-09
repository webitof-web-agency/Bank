// Google Drive: connect (OAuth), database backups (newest 7 kept, daily at
// 2 AM IST), the manual backup downloaded to the user's computer, and the
// gdrive upload storage provider.
//
// Google is a fake answering on the stubbed fetch: no real Google call, no
// real account. Uses its own database (bank_test_google_drive).
process.env.PG_DATABASE = process.env.GDRIVE_TEST_DATABASE || 'bank_test_google_drive';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
const Settings = require('../models/settings.model');
const JobState = require('../models/jobState.model');
const FileAsset = require('../models/fileAsset.model');
const { initializeDatabase, closeDatabase } = require('../config/postgres');
const connection = require('../services/googleDrive/driveConnection.service');
const backups = require('../services/googleDrive/backup.service');
const GoogleDriveStorageProvider = require('../services/storage/providers/gdrive.provider');
const googleDriveController = require('../controllers/googleDrive.controller');

const CLIENT_SECRET = 'gdrive-test-client-secret-91f0';
const REFRESH_TOKEN = 'gdrive-test-refresh-token-5c2e';
const ACCESS_TOKEN = 'gdrive-test-access-token-77ab';
const DB_PASSWORD_MARKER = 'pg-password-should-never-show';

const USERS = {
  admin: { id: null, isSuperAdmin: true, permissions: [] },
  writer: { id: null, isSuperAdmin: false, branchCode: '', permissions: ['settings.read', 'settings.write'] },
  reader: { id: null, isSuperAdmin: false, branchCode: '', permissions: ['settings.read'] }
};

// ---------------------------------------------------------------------------
// Fake Google

const google = {
  files: new Map(),
  nextId: 1,
  revoked: [],
  invalidGrant: false,
  email: 'society.backup@gmail.com',
  calls: []
};

function resetGoogle() {
  google.files.clear();
  google.revoked.length = 0;
  google.invalidGrant = false;
  google.email = 'society.backup@gmail.com';
  google.calls.length = 0;
}

function jsonResponse(status, body, headers = {}) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

let createdSeq = 0;
function addFile(meta) {
  const id = `f${google.nextId++}`;
  createdSeq += 1;
  const createdTime = meta.createdTime || new Date(Date.UTC(2026, 9, 1, 0, 0, createdSeq)).toISOString();
  google.files.set(id, { id, trashed: false, createdTime, ...meta });
  return google.files.get(id);
}

async function fakeGoogle(url, options = {}) {
  const u = new URL(String(url));
  const method = options.method || 'GET';
  google.calls.push({ method, url: u.origin + u.pathname, headers: options.headers || {}, body: typeof options.body === 'string' ? options.body : '' });
  const auth = options.headers?.Authorization || '';

  if (u.href.startsWith('https://oauth2.googleapis.com/token')) {
    const form = new URLSearchParams(options.body);
    if (form.get('client_secret') !== CLIENT_SECRET) return jsonResponse(401, { error: 'invalid_client' });
    if (form.get('grant_type') === 'authorization_code') {
      if (form.get('code') !== 'good-code') return jsonResponse(400, { error: 'invalid_grant', error_description: 'Bad code' });
      return jsonResponse(200, { access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN, expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' });
    }
    if (google.invalidGrant || form.get('refresh_token') !== REFRESH_TOKEN) return jsonResponse(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
    return jsonResponse(200, { access_token: ACCESS_TOKEN, expires_in: 3600 });
  }
  if (u.href.startsWith('https://oauth2.googleapis.com/revoke')) {
    google.revoked.push(u.searchParams.get('token'));
    return jsonResponse(200, {});
  }
  if (auth !== `Bearer ${ACCESS_TOKEN}`) return jsonResponse(401, { error: { message: 'Invalid Credentials' } });

  if (u.pathname === '/drive/v3/about') return jsonResponse(200, { user: { emailAddress: google.email, displayName: 'Society' } });
  if (u.pathname === '/drive/v3/files' && method === 'POST') {
    const body = JSON.parse(options.body);
    const file = addFile({ name: body.name, mimeType: body.mimeType, parents: body.parents || [] });
    return jsonResponse(200, { id: file.id, name: file.name });
  }
  if (u.pathname === '/drive/v3/files' && method === 'GET') {
    const parent = /'([^']+)' in parents/.exec(u.searchParams.get('q'))[1];
    const files = [...google.files.values()].filter((f) => !f.trashed && (f.parents || []).includes(parent))
      .sort((a, b) => b.createdTime.localeCompare(a.createdTime));
    return jsonResponse(200, { files: files.map(({ id, name, size, createdTime, mimeType }) => ({ id, name, size, createdTime, mimeType })) });
  }
  const fileMatch = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
  if (fileMatch) {
    const file = google.files.get(decodeURIComponent(fileMatch[1]));
    if (!file) return jsonResponse(404, { error: { message: 'File not found' } });
    if (method === 'DELETE') { google.files.delete(file.id); return new Response(null, { status: 204 }); }
    if (u.searchParams.get('alt') === 'media') return new Response(file.content || Buffer.alloc(0), { status: 200 });
    return jsonResponse(200, { id: file.id, name: file.name, mimeType: file.mimeType, trashed: file.trashed, size: String(file.content?.length || 0), createdTime: file.createdTime });
  }
  if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
    const body = JSON.parse(options.body);
    const session = `https://www.googleapis.com/upload/drive/v3/files?upload_id=${encodeURIComponent(JSON.stringify({ name: body.name, parents: body.parents, mimeType: options.headers['X-Upload-Content-Type'] }))}`;
    return new Response(null, { status: 200, headers: { Location: session } });
  }
  if (u.pathname === '/upload/drive/v3/files' && method === 'PUT') {
    const meta = JSON.parse(u.searchParams.get('upload_id'));
    const file = addFile({ ...meta, content: Buffer.from(options.body), size: String(options.body.length) });
    return jsonResponse(200, { id: file.id, name: file.name, size: file.size, createdTime: file.createdTime });
  }
  return jsonResponse(404, { error: { message: `unhandled ${method} ${u.pathname}` } });
}

// ---------------------------------------------------------------------------

let server;
let baseUrl;
const realFetch = globalThis.fetch;

function setEnv(overrides = {}) {
  Object.assign(process.env, {
    JWT_SECRET: process.env.JWT_SECRET || 'gdrive-test-jwt-secret-0123456789abcdef',
    GOOGLE_OAUTH_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    GOOGLE_OAUTH_CLIENT_SECRET: CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:8001/api/google-drive/oauth/callback',
    FRONTEND_URL: 'http://localhost:5173',
    SETTINGS_ENCRYPTION_KEY: 'a'.repeat(64),
    GDRIVE_BACKUP_KEEP: '7',
    GDRIVE_BACKUP_HOUR_IST: '2',
    STORAGE_PROVIDER: '',
    ...overrides
  });
}

async function call(method, path, { user = 'writer', body } = {}) {
  const response = await realFetch(`${baseUrl}${path}`, {
    method,
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', 'x-test-user': user },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_e) { json = null; }
  return { status: response.status, text, body: json, location: response.headers.get('location') };
}

function assertNoSecrets(text) {
  for (const secret of [CLIENT_SECRET, REFRESH_TOKEN, ACCESS_TOKEN, DB_PASSWORD_MARKER]) {
    assert.equal(text.includes(secret), false, `"${secret}" leaked`);
  }
}

// A stand-in pg_dump: writes a small "dump" so no real database tool runs.
let dumpCount = 0;
function fakeDump({ file }) {
  dumpCount += 1;
  return require('fs').promises.writeFile(file, `PGDMP fake dump ${dumpCount}`);
}

async function connect() {
  const state = jwt.sign({ purpose: 'gdrive-connect', uid: null }, process.env.JWT_SECRET, { expiresIn: '10m' });
  return call('GET', `/google-drive/oauth/callback?code=good-code&state=${encodeURIComponent(state)}`);
}

async function resetState() {
  for (const key of ['google_drive', 'google_drive_backup', 'storage_settings']) {
    const doc = await Settings.findOne({ key }).lean();
    if (doc) await Settings.findByIdAndDelete(doc.id);
  }
  const job = await JobState.findOne({ key: 'gdrive-db-backup' }).lean();
  if (job) await JobState.findByIdAndDelete(job.id);
  for (const file of await FileAsset.find({ storageProvider: 'gdrive' }).lean()) await FileAsset.findByIdAndDelete(file.id);
}

test.before(async () => {
  setEnv();
  await initializeDatabase();
  connection.setFetchForTests(fakeGoogle);
  backups.setDumpRunnerForTests(fakeDump);
  const app = express();
  app.use(express.json());
  app.get('/api/google-drive/oauth/callback', googleDriveController.oauthCallbackController);
  app.use((req, _res, next) => { req.user = USERS[req.get('x-test-user')] || null; next(); });
  app.use('/api/google-drive', require('../routes/googleDrive.routes'));
  app.use('/api/backup', require('../routes/backup.routes'));
  app.use(require('../middlewares/errorHandler'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  connection.setFetchForTests(null);
  backups.setDumpRunnerForTests(null);
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDatabase();
});

test.beforeEach(async () => {
  setEnv();
  resetGoogle();
  connection.setFetchForTests(fakeGoogle);
  await resetState();
});

// ---------------------------------------------------------------------------
// Connect

test('not configured: status lists what is missing; connect refused', async () => {
  setEnv({ GOOGLE_OAUTH_CLIENT_ID: '', SETTINGS_ENCRYPTION_KEY: '' });
  const status = await call('GET', '/google-drive/status', { user: 'reader' });
  assert.equal(status.status, 200);
  assert.equal(status.body.data.drive.configured, false);
  assert.match(status.body.data.drive.problems.join(' '), /GOOGLE_OAUTH_CLIENT_ID.*SETTINGS_ENCRYPTION_KEY/);
  assert.equal((await call('POST', '/google-drive/connect')).status, 400);
});

test('permissions: reading needs settings.read; connect and downloads need settings.write', async () => {
  assert.equal((await call('GET', '/google-drive/status', { user: 'nobody' })).status, 401);
  assert.equal((await call('POST', '/google-drive/connect', { user: 'reader' })).status, 403);
  assert.equal((await call('POST', '/google-drive/disconnect', { user: 'reader' })).status, 403);
  assert.equal((await call('GET', '/backup/download', { user: 'reader' })).status, 403);
  // Manual backups no longer go to Drive.
  assert.equal((await call('POST', '/google-drive/backups')).status, 404);
  assert.equal((await call('GET', '/google-drive/backups/x/download', { user: 'reader' })).status, 403);
  assert.equal((await call('GET', '/google-drive/backups', { user: 'reader' })).status, 200);
});

test('connect: sign-in link asks for drive.file offline access with a signed state', async () => {
  const response = await call('POST', '/google-drive/connect');
  assert.equal(response.status, 200);
  const url = new URL(response.body.data.url);
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:8001/api/google-drive/oauth/callback');
  assert.equal(jwt.verify(url.searchParams.get('state'), process.env.JWT_SECRET).purpose, 'gdrive-connect');
  assertNoSecrets(response.text);
});

test('callback: a bad or missing state, a denial or a bad code connects nothing', async () => {
  const forged = jwt.sign({ purpose: 'gdrive-connect' }, 'some-other-secret');
  for (const query of [
    'code=good-code&state=nonsense',
    `code=good-code&state=${forged}`,
    `error=access_denied&state=${jwt.sign({ purpose: 'gdrive-connect' }, process.env.JWT_SECRET)}`,
    `code=bad-code&state=${jwt.sign({ purpose: 'gdrive-connect' }, process.env.JWT_SECRET)}`
  ]) {
    const response = await call('GET', `/google-drive/oauth/callback?${query}`);
    assert.equal(response.status, 302);
    const target = new URL(response.location);
    assert.equal(target.origin + target.pathname, 'http://localhost:5173/app/settings/google-drive');
    assert.equal(target.searchParams.get('gdrive'), 'error', query);
    assertNoSecrets(response.location);
  }
  assert.equal((await connection.getStatus()).connected, false);
});

test('callback: connects, stores the token encrypted, creates both folders; status never shows a token', async () => {
  const response = await connect();
  assert.equal(new URL(response.location).searchParams.get('gdrive'), 'connected');

  const doc = await Settings.findOne({ key: 'google_drive' }).lean();
  const stored = JSON.stringify(doc.payload);
  assert.equal(stored.includes(REFRESH_TOKEN), false, 'refresh token stored encrypted');
  assert.ok(doc.payload.encryptedRefreshToken);

  const status = await call('GET', '/google-drive/status', { user: 'reader' });
  const drive = status.body.data.drive;
  assert.deepEqual([drive.connected, drive.needsReconnect, drive.accountEmail], [true, false, 'society.backup@gmail.com']);
  assert.equal(drive.backupFolder.name, 'Banking Raipur – DB Backups');
  assert.equal(drive.uploadsFolder.name, 'Banking Raipur – Uploads');
  assert.match(drive.backupFolder.link, /^https:\/\/drive\.google\.com\/drive\/folders\/f\d+$/);
  assert.equal(Object.hasOwn(drive, 'encryptedRefreshToken'), false);
  assertNoSecrets(status.text);
  assert.equal(status.text.includes(doc.payload.encryptedRefreshToken), false);
  const folders = [...google.files.values()].filter((f) => f.mimeType === 'application/vnd.google-apps.folder');
  assert.equal(folders.length, 2);
});

test('revoked consent (invalid_grant): marked "needs reconnect"', async () => {
  await connect();
  google.invalidGrant = true;
  connection.setFetchForTests(fakeGoogle); // drop the cached access token
  await assert.rejects((await connection.getClient()).listFiles('x'));
  assert.equal((await connection.getStatus()).needsReconnect, true);
  // The schedule does not try while it needs reconnecting.
  assert.deepEqual(await backups.runScheduledBackupIfDue(new Date('2026-10-08T21:00:00Z')), { skipped: 'not connected' });
});

test('disconnect: refused while Drive is the upload storage; otherwise revokes and forgets', async () => {
  await connect();
  await Settings.findOneAndUpdate({ key: 'storage_settings' }, { $set: { key: 'storage_settings', payload: { configurationSource: 'site_settings', activeProvider: 'gdrive' } } }, { upsert: true, new: true });
  const refused = await call('POST', '/google-drive/disconnect');
  assert.equal(refused.status, 409);
  assert.match(refused.body.message, /active upload storage/);

  await Settings.findOneAndUpdate({ key: 'storage_settings' }, { $set: { payload: { configurationSource: 'site_settings', activeProvider: 'local' } } });
  const ok = await call('POST', '/google-drive/disconnect');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.connected, false);
  assert.deepEqual(google.revoked, [REFRESH_TOKEN]);
  assert.equal((await Settings.findOne({ key: 'google_drive' }).lean()).payload.encryptedRefreshToken, '');
});

test('files on Drive: no disconnect and no switch to another account while they exist', async () => {
  await connect();
  const file = await FileAsset.create({ originalName: 'photo.jpg', storedName: 'photo.jpg', storageProvider: 'gdrive', storageKey: 'f-stored' });

  const refused = await call('POST', '/google-drive/disconnect');
  assert.equal(refused.status, 409);
  assert.match(refused.body.message, /still stored in Google Drive/);

  // Signing in with a different Gmail account is refused; the old one stays.
  google.email = 'someone.else@gmail.com';
  const switched = await connect();
  assert.equal(new URL(switched.location).searchParams.get('gdrive'), 'error');
  assert.match(new URL(switched.location).searchParams.get('message'), /society\.backup@gmail\.com/);
  assert.equal((await connection.getStatus()).accountEmail, 'society.backup@gmail.com');

  // The same account may reconnect.
  google.email = 'society.backup@gmail.com';
  assert.equal(new URL((await connect()).location).searchParams.get('gdrive'), 'connected');

  await FileAsset.findByIdAndDelete(file.id || file._id);
  assert.equal((await call('POST', '/google-drive/disconnect')).status, 200);
});

// ---------------------------------------------------------------------------
// Backups

test('backup: uploads a pg_dump to the backup folder and records it', async () => {
  await connect();
  const result = await backups.runBackup({ trigger: 'manual' });
  assert.equal(result.status, 'SUCCESS');
  assert.match(result.fileName, /^bank-backup-bank_test_google_drive-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-IST\.dump$/);
  const state = await connection.readState();
  const uploaded = google.files.get(result.fileId);
  assert.deepEqual(uploaded.parents, [state.backupFolderId]);
  assert.match(uploaded.content.toString(), /^PGDMP fake dump/);
  const status = (await call('GET', '/google-drive/status', { user: 'reader' })).body.data.backup;
  assert.deepEqual([status.running, status.keep, status.schedule.label, status.last.status, status.lastSuccess.fileName], [false, 7, 'Daily at 02:00 IST', 'SUCCESS', result.fileName]);
});

test('retention: only the newest 7 backups stay; other files in the folder are never touched', async () => {
  await connect();
  const state = await connection.readState();
  const keepMe = addFile({ name: 'notes from admin.txt', parents: [state.backupFolderId], createdTime: '2020-01-01T00:00:00.000Z' });
  const ids = [];
  for (let i = 0; i < 9; i += 1) ids.push((await backups.runBackup()).fileId);
  const listed = await backups.listBackups();
  // Exactly the 7 newest remain; the 2 oldest were deleted.
  assert.deepEqual(listed.map((b) => b.id).sort(), ids.slice(2).sort());
  assert.equal(google.files.has(ids[0]) || google.files.has(ids[1]), false);
  assert.ok(google.files.has(keepMe.id), 'a non-backup file stays');
  assert.equal((await backups.getBackupStatus()).last.removed, 1);
});

test('pg_dump failure: FAILED with the reason, nothing uploaded, password never shown', async () => {
  await connect();
  backups.setDumpRunnerForTests(async () => { throw new Error('pg_dump failed (exit 1): connection refused'); });
  try {
    const result = await backups.runBackup();
    assert.equal(result.status, 'FAILED');
    assert.match(result.error, /connection refused/);
    assert.equal([...google.files.values()].filter((f) => backups.FILE_RE.test(f.name)).length, 0);
    const status = await call('GET', '/google-drive/status', { user: 'reader' });
    assert.equal(status.body.data.backup.last.status, 'FAILED');
    assertNoSecrets(status.text);
  } finally {
    backups.setDumpRunnerForTests(fakeDump);
  }
});

test('not connected: listing is empty', async () => {
  assert.deepEqual((await call('GET', '/google-drive/backups', { user: 'reader' })).body.data, []);
});

test('one backup at a time: a second concurrent run reports ALREADY_RUNNING', async () => {
  await connect();
  let release;
  backups.setDumpRunnerForTests(async (args) => { await new Promise((resolve) => { release = resolve; }); return fakeDump(args); });
  try {
    const first = backups.runBackup();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(await backups.runBackup(), { status: 'ALREADY_RUNNING' });
    assert.equal((await backups.getBackupStatus()).running, true);
    release();
    assert.equal((await first).status, 'SUCCESS');
  } finally {
    backups.setDumpRunnerForTests(fakeDump);
  }
});

test('manual backup: downloaded to the computer, nothing sent to Drive, temp file removed', async () => {
  const fs = require('fs');
  const os = require('os');
  const tmpBefore = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('bank-backup-')).length;
  // Works without Google Drive connected.
  const response = await realFetch(`${baseUrl}/backup/download`, { headers: { 'x-test-user': 'writer' } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /attachment; filename="bank-backup-.*\.dump"/);
  assert.match(await response.text(), /^PGDMP fake dump/);
  assert.equal(google.calls.length, 0);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('bank-backup-')).length, tmpBefore);
});

test('manual backup: a pg_dump failure is an error, not a file', async () => {
  backups.setDumpRunnerForTests(async () => { throw new Error('pg_dump failed (exit 1): connection refused'); });
  try {
    const response = await call('GET', '/backup/download');
    assert.equal(response.status, 500);
  } finally {
    backups.setDumpRunnerForTests(fakeDump);
  }
});

test('schedule: once per India date, at or after 2 AM IST', async () => {
  await connect();
  // 2026-10-09 01:30 IST = 2026-10-08 20:00 UTC.
  assert.deepEqual(await backups.runScheduledBackupIfDue(new Date('2026-10-08T20:00:00Z')), { skipped: 'not yet' });
  // 02:10 IST.
  assert.equal((await backups.runScheduledBackupIfDue(new Date('2026-10-08T20:40:00Z'))).status, 'SUCCESS');
  // Later the same India day: not again.
  assert.deepEqual(await backups.runScheduledBackupIfDue(new Date('2026-10-09T10:00:00Z')), { skipped: 'already ran today' });
  // Next India day.
  assert.equal((await backups.runScheduledBackupIfDue(new Date('2026-10-09T21:00:00Z'))).status, 'SUCCESS');
  setEnv({ GDRIVE_BACKUP_HOUR_IST: '-1' });
  assert.deepEqual(await backups.runScheduledBackupIfDue(new Date('2026-10-11T21:00:00Z')), { skipped: 'schedule off' });
});

test('a deleted backup folder is recreated on the next backup', async () => {
  await connect();
  const before = await connection.readState();
  google.files.delete(before.backupFolderId);
  assert.equal((await backups.runBackup()).status, 'SUCCESS');
  const after = await connection.readState();
  assert.notEqual(after.backupFolderId, before.backupFolderId);
  assert.ok(google.files.has(after.backupFolderId));
});

test('download: a listed backup streams; any other Drive file id is 404', async () => {
  await connect();
  const { fileId } = await backups.runBackup();
  const response = await realFetch(`${baseUrl}/google-drive/backups/${fileId}/download`, { headers: { 'x-test-user': 'writer' } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /attachment; filename="bank-backup-.*\.dump"/);
  assert.match(await response.text(), /^PGDMP fake dump/);
  const state = await connection.readState();
  assert.equal((await call('GET', `/google-drive/backups/${state.uploadsFolderId}/download`)).status, 404);
});

test('real pg_dump: a backup of the test database is a valid custom-format dump', async (t) => {
  const { spawnSync } = require('node:child_process');
  if (spawnSync('pg_dump', ['--version']).status !== 0) return t.skip('pg_dump not installed');
  await connect();
  backups.setDumpRunnerForTests(null);
  try {
    const result = await backups.runBackup();
    assert.equal(result.status, 'SUCCESS', result.error);
    const content = google.files.get(result.fileId).content;
    assert.equal(content.subarray(0, 5).toString(), 'PGDMP');
    assert.ok(content.length > 1000);
  } finally {
    backups.setDumpRunnerForTests(fakeDump);
  }
});

// ---------------------------------------------------------------------------
// Upload storage provider

test('gdrive storage: upload, exists, stream, delete in the Uploads folder', async () => {
  await connect();
  const provider = new GoogleDriveStorageProvider({});
  const locator = await provider.upload(Buffer.from('photo-bytes'), 'images/members/M1/123-abc.jpg', { mimeType: 'image/jpeg' });
  const state = await connection.readState();
  assert.deepEqual([locator.storageProvider, locator.storageBucket], ['gdrive', state.uploadsFolderId]);
  const file = google.files.get(locator.storageKey);
  assert.deepEqual([file.name, file.mimeType, file.parents[0]], ['images__members__M1__123-abc.jpg', 'image/jpeg', state.uploadsFolderId]);
  assert.equal(await provider.exists(locator), true);
  assert.equal(await provider.getSignedUrl(locator), null);
  const stream = await provider.getStream(locator);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), 'photo-bytes');
  await provider.delete(locator);
  assert.equal(await provider.exists(locator), false);
  assert.deepEqual(await provider.testConnection(), { success: true, message: 'Connection successful' });
});

test('storage service: Drive is used for new uploads once selected; old files keep their provider', async () => {
  await connect();
  const storage = require('../services/storage/storage.service');
  await Settings.findOneAndUpdate({ key: 'storage_settings' }, { $set: { key: 'storage_settings', payload: { configurationSource: 'site_settings', activeProvider: 'gdrive' } } }, { upsert: true, new: true });
  await storage.reloadConfig();
  const locator = await storage.upload(Buffer.from('doc'), 'documents/members/M2/x.pdf', { mimeType: 'application/pdf' });
  assert.equal(locator.storageProvider, 'gdrive');
  assert.equal(await storage.exists(locator), true);
  // A file stored locally before still resolves to the local provider.
  const LocalStorageProvider = require('../services/storage/providers/local.provider');
  assert.ok(await storage._getHistoricalProviderWithAuth({ storageProvider: 'local', storageKey: 'images/x.jpg' }) instanceof LocalStorageProvider);
  await Settings.findOneAndUpdate({ key: 'storage_settings' }, { $set: { payload: { configurationSource: 'site_settings', activeProvider: 'local' } } });
  await storage.reloadConfig();
});
