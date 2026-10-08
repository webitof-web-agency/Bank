// The connected Google Drive: one Gmail account, connected once by an
// administrator ("Connect Google Drive"), used for database backups and,
// when chosen as the storage provider, for uploaded files.
//
// Stored in settings (key google_drive): the refresh token ENCRYPTED with
// SETTINGS_ENCRYPTION_KEY, the account email, and the two folder ids.
// Nothing secret ever leaves the backend: getStatus() is what the page sees.
const jwt = require('jsonwebtoken');
const Settings = require('../../models/settings.model');
const encryption = require('../../utils/encryption');
const { getGoogleDriveConfig, getGoogleDriveConfigProblems } = require('../../config/googleDrive');
const { DriveClient, DriveError, buildAuthUrl, exchangeCode, revokeToken } = require('./drive.client');

const SETTINGS_KEY = 'google_drive';
const STATE_PURPOSE = 'gdrive-connect';
const FOLDERS = Object.freeze({
  backup: { idField: 'backupFolderId', nameField: 'backupFolderName', configName: 'backupFolderName' },
  uploads: { idField: 'uploadsFolderId', nameField: 'uploadsFolderName', configName: 'uploadsFolderName' }
});

let fetchImpl = globalThis.fetch;
let cachedClient = null;

// Tests only: route Google calls to a stub.
function setFetchForTests(impl) {
  fetchImpl = impl || globalThis.fetch;
  cachedClient = null;
}

function httpError(message, statusCode, code = '') {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

async function readState() {
  const doc = await Settings.findOne({ key: SETTINGS_KEY }).lean();
  return doc?.payload && typeof doc.payload === 'object' ? doc.payload : {};
}

async function writeState(patch) {
  const next = { ...(await readState()), ...patch };
  await Settings.findOneAndUpdate({ key: SETTINGS_KEY }, { $set: { key: SETTINGS_KEY, payload: next } }, { upsert: true, new: true });
  return next;
}

function folderLink(id) {
  return id ? `https://drive.google.com/drive/folders/${id}` : '';
}

async function getStatus() {
  const config = getGoogleDriveConfig();
  const state = await readState();
  const problems = getGoogleDriveConfigProblems(config);
  return {
    configured: problems.length === 0,
    problems,
    connected: Boolean(state.encryptedRefreshToken),
    needsReconnect: Boolean(state.encryptedRefreshToken && state.needsReconnect),
    accountEmail: state.accountEmail || '',
    connectedAt: state.connectedAt || null,
    redirectUri: config.redirectUri,
    backupFolder: { id: state.backupFolderId || '', name: state.backupFolderName || '', link: folderLink(state.backupFolderId) },
    uploadsFolder: { id: state.uploadsFolderId || '', name: state.uploadsFolderName || '', link: folderLink(state.uploadsFolderId) }
  };
}

// The Google sign-in link. `state` is signed and short-lived, so a callback
// can only finish a connection an administrator started here.
function createAuthUrl(user = {}) {
  const config = getGoogleDriveConfig();
  const problems = getGoogleDriveConfigProblems(config);
  if (problems.length) throw httpError(`Google Drive is not configured: ${problems.join(' ')}`, 400, 'GDRIVE_CONFIG');
  const state = jwt.sign({ purpose: STATE_PURPOSE, uid: user.id || null }, process.env.JWT_SECRET, { expiresIn: '10m' });
  return buildAuthUrl({ clientId: config.clientId, redirectUri: config.redirectUri, state });
}

function verifyState(state) {
  try {
    const payload = jwt.verify(String(state || ''), process.env.JWT_SECRET);
    if (payload?.purpose !== STATE_PURPOSE) throw new Error('wrong purpose');
    return payload;
  } catch (_error) {
    throw httpError('The Google Drive sign-in link has expired or is invalid. Start again from Settings.', 400, 'GDRIVE_STATE');
  }
}

function clientFor(state, config = getGoogleDriveConfig()) {
  if (!state.encryptedRefreshToken) throw httpError('Google Drive is not connected.', 409, 'GDRIVE_NOT_CONNECTED');
  if (cachedClient && cachedClient.tokenRef === state.encryptedRefreshToken) return cachedClient.client;
  const client = new DriveClient({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    refreshToken: encryption.decrypt(state.encryptedRefreshToken),
    fetchImpl,
    onInvalidGrant: () => writeState({ needsReconnect: true })
  });
  cachedClient = { tokenRef: state.encryptedRefreshToken, client };
  return client;
}

async function getClient() {
  return clientFor(await readState());
}

// The folder's id, recreated when it was deleted or trashed in Drive.
async function ensureFolder(kind, client = null, state = null) {
  const folder = FOLDERS[kind];
  if (!folder) throw new Error(`Unknown Drive folder: ${kind}`);
  const current = state || await readState();
  const drive = client || clientFor(current);
  const existing = current[folder.idField] ? await drive.getFile(current[folder.idField]) : null;
  if (existing) return existing.id;
  const name = getGoogleDriveConfig()[folder.configName];
  const created = await drive.createFolder(name);
  await writeState({ [folder.idField]: created.id, [folder.nameField]: created.name || name });
  return created.id;
}

// Google sent the browser back here with ?code&state (or ?error).
async function completeConnection({ code, state, error } = {}) {
  const started = verifyState(state);
  if (error) throw httpError(error === 'access_denied' ? 'Google Drive access was not granted.' : `Google sign-in failed (${String(error).slice(0, 60)}).`, 400, 'GDRIVE_DENIED');
  if (!code) throw httpError('Google did not return an authorisation code.', 400, 'GDRIVE_NO_CODE');
  const config = getGoogleDriveConfig();
  const problems = getGoogleDriveConfigProblems(config);
  if (problems.length) throw httpError(`Google Drive is not configured: ${problems.join(' ')}`, 400, 'GDRIVE_CONFIG');

  const tokens = await exchangeCode({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, code, fetchImpl });
  if (!tokens.refreshToken) throw httpError('Google did not return a refresh token. Remove the app from your Google account permissions and connect again.', 400, 'GDRIVE_NO_REFRESH');

  const previous = await readState();
  const encryptedRefreshToken = encryption.encrypt(tokens.refreshToken);
  const client = new DriveClient({ clientId: config.clientId, clientSecret: config.clientSecret, refreshToken: tokens.refreshToken, fetchImpl });
  const account = await client.getAccount();
  // A different account cannot see the old folders: start fresh.
  const sameAccount = previous.accountEmail && previous.accountEmail === account.email;
  const state0 = await writeState({
    encryptedRefreshToken,
    needsReconnect: false,
    accountEmail: account.email,
    connectedAt: new Date().toISOString(),
    connectedByUserId: started.uid || null,
    ...(sameAccount ? {} : { backupFolderId: '', backupFolderName: '', uploadsFolderId: '', uploadsFolderName: '' })
  });
  cachedClient = { tokenRef: encryptedRefreshToken, client };
  await ensureFolder('backup', client, state0);
  await ensureFolder('uploads', client, await readState());
  return getStatus();
}

async function disconnect({ activeStorageProvider = '' } = {}) {
  if (activeStorageProvider === 'gdrive') {
    throw httpError('Google Drive is the active upload storage. Switch Storage Providers to another provider first.', 409, 'GDRIVE_IN_USE');
  }
  const state = await readState();
  if (state.encryptedRefreshToken) {
    try {
      await revokeToken(encryption.decrypt(state.encryptedRefreshToken), { fetchImpl });
    } catch (_error) {
      // Undecryptable (key changed): forget it anyway.
    }
  }
  cachedClient = null;
  await writeState({ encryptedRefreshToken: '', needsReconnect: false, accountEmail: '', connectedAt: null, backupFolderId: '', backupFolderName: '', uploadsFolderId: '', uploadsFolderName: '' });
  return getStatus();
}

module.exports = {
  DriveError,
  SETTINGS_KEY,
  completeConnection,
  createAuthUrl,
  disconnect,
  ensureFolder,
  getClient,
  getStatus,
  readState,
  setFetchForTests,
  writeState
};
