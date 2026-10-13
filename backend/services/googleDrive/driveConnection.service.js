// The connected Google Drive: one Gmail account, connected once by an
// administrator ("Connect Google Drive"), used for database backups and,
// when chosen as the storage provider, for uploaded files.
//
// Stored in settings (key google_drive): the refresh token ENCRYPTED with
// SETTINGS_ENCRYPTION_KEY, the account email, and the two folder ids.
// Nothing secret ever leaves the backend: getStatus() is what the page sees.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Settings = require('../../models/settings.model');
const encryption = require('../../utils/encryption');
const { getGoogleDriveConfig, getGoogleDriveConfigProblems } = require('../../config/googleDrive');
const { DriveClient, DriveError, FOLDER_MIME, buildAuthUrl, exchangeCode, revokeToken } = require('./drive.client');

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

// Uploaded files stored in the connected Drive (storage provider "gdrive").
// They are reachable only through this account's token, so while any exist
// the account may be neither disconnected nor swapped for another.
async function hasFilesOnDrive() {
  const FileAsset = require('../../models/fileAsset.model');
  return Boolean(await FileAsset.findOne({ storageProvider: 'gdrive' }).lean());
}

function folderLink(id) {
  return id ? `https://drive.google.com/drive/folders/${id}` : '';
}

async function getStatus() {
  await connectFromEnvToken();
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
    const payload = jwt.verify(String(state || ''), process.env.JWT_SECRET, { algorithms: ['HS256'] });
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
  await connectFromEnvToken();
  return clientFor(await readState());
}

// The folder's id, recreated when it was deleted or trashed in Drive.
async function ensureFolder(kind, client = null, state = null) {
  const folder = FOLDERS[kind];
  if (!folder) throw new Error(`Unknown Drive folder: ${kind}`);
  const current = state || await readState();
  const drive = client || clientFor(current);
  const config = getGoogleDriveConfig();
  const parentId = config.parentFolderId;
  const existing = current[folder.idField] ? await drive.getFile(current[folder.idField]) : null;
  // Kept while it sits in the configured main folder (or anywhere, with none).
  if (existing && (!parentId || (existing.parents || []).includes(parentId))) return existing.id;
  const name = config[folder.configName];
  // Under a main folder, reuse a folder of the same name already there.
  let target;
  try {
    const match = parentId
      ? (await drive.listFiles(parentId)).find((file) => file.mimeType === FOLDER_MIME && file.name === name)
      : null;
    target = match || await drive.createFolder(name, parentId);
  } catch (error) {
    if (parentId && (error.status === 404 || error.status === 403)) {
      throw httpError('The main Drive folder (GDRIVE_PARENT_FOLDER_ID) is not reachable with this token. Check the id, and that the token has the full "drive" scope (with "drive.file" the app only sees folders it created).', 400, 'GDRIVE_PARENT_FOLDER');
    }
    throw error;
  }
  await writeState({ [folder.idField]: target.id, [folder.nameField]: target.name || name });
  return target.id;
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

  await saveConnection(tokens.refreshToken, { connectedByUserId: started.uid || null, revokeOnReject: true });
  return getStatus();
}

// Stores a refresh token as the connection (encrypted), reads the account it
// belongs to and makes sure both folders exist.
async function saveConnection(refreshToken, { connectedByUserId = null, revokeOnReject = false, extra = {} } = {}) {
  const config = getGoogleDriveConfig();
  const previous = await readState();
  const encryptedRefreshToken = encryption.encrypt(refreshToken);
  const client = new DriveClient({ clientId: config.clientId, clientSecret: config.clientSecret, refreshToken, fetchImpl });
  const account = await client.getAccount();
  // A different account cannot see the old folders: start fresh.
  const sameAccount = previous.accountEmail && previous.accountEmail === account.email;
  if (previous.accountEmail && !sameAccount && await hasFilesOnDrive()) {
    if (revokeOnReject) await revokeToken(refreshToken, { fetchImpl });
    throw httpError(`Uploaded files are stored in the Google Drive of ${previous.accountEmail}. Connect with that account; another account cannot open them.`, 409, 'GDRIVE_FILES_ON_OTHER_ACCOUNT');
  }
  const state0 = await writeState({
    encryptedRefreshToken,
    needsReconnect: false,
    accountEmail: account.email,
    connectedAt: new Date().toISOString(),
    connectedByUserId,
    envTokenHash: '',
    ...extra,
    ...(sameAccount ? {} : { backupFolderId: '', backupFolderName: '', uploadsFolderId: '', uploadsFolderName: '' })
  });
  cachedClient = { tokenRef: encryptedRefreshToken, client };
  await ensureFolder('backup', client, state0);
  await ensureFolder('uploads', client, await readState());
}

// GOOGLE_OAUTH_REFRESH_TOKEN (optional): a refresh token issued for this
// GOOGLE_OAUTH_CLIENT_ID connects Drive without the sign-in flow. Applied once
// per token value (only its hash is remembered), so a later "Connect Google
// Drive" or Disconnect in Settings is not overwritten on every restart.
let envConnectPromise = null;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function connectFromEnvToken() {
  const token = String(process.env.GOOGLE_OAUTH_REFRESH_TOKEN || '').trim();
  if (!token || getGoogleDriveConfigProblems().length) return;
  const hash = hashToken(token);
  const state = await readState();
  if (state.envTokenHash === hash) return;
  if (!envConnectPromise) {
    envConnectPromise = saveConnection(token, { extra: { envTokenHash: hash } })
      .catch((error) => {
        console.error('[gdrive] GOOGLE_OAUTH_REFRESH_TOKEN could not connect:', error.message);
        // Remember the attempt so a bad token is not retried on every call.
        return writeState({ envTokenHash: hash });
      })
      .finally(() => { envConnectPromise = null; });
  }
  await envConnectPromise;
}

async function disconnect({ activeStorageProvider = '' } = {}) {
  if (activeStorageProvider === 'gdrive') {
    throw httpError('Google Drive is the active upload storage. Switch Storage Providers to another provider first.', 409, 'GDRIVE_IN_USE');
  }
  if (await hasFilesOnDrive()) {
    throw httpError('Uploaded files are still stored in Google Drive and would stop opening. Google Drive cannot be disconnected while they exist.', 409, 'GDRIVE_HAS_FILES');
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
  // envTokenHash is kept: disconnecting is not undone by the next restart.
  await writeState({ encryptedRefreshToken: '', needsReconnect: false, accountEmail: '', connectedAt: null, backupFolderId: '', backupFolderName: '', uploadsFolderId: '', uploadsFolderName: '' });
  return getStatus();
}

module.exports = {
  DriveError,
  SETTINGS_KEY,
  completeConnection,
  connectFromEnvToken,
  createAuthUrl,
  disconnect,
  ensureFolder,
  getClient,
  getStatus,
  readState,
  setFetchForTests,
  writeState
};
