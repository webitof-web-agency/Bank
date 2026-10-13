// Minimal Google OAuth + Drive v3 client over fetch (no extra dependency).
//
// Scope drive.file: the app sees only files and folders it created itself,
// never the rest of the account's Drive. Tokens are never logged or put in
// an error message.
const { Readable } = require('stream');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

class DriveError extends Error {
  constructor(message, { status = null, code = '' } = {}) {
    super(message);
    this.name = 'DriveError';
    // The text is Google's reason or our own: safe to show the user.
    this.expose = true;
    this.status = status;
    this.code = code;
  }
}

function buildAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    // Always ask, so Google always returns a refresh token.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

// Google's error text, without anything from the request.
function errorFrom(response, data, action) {
  const reason = data?.error?.message || data?.error_description || (typeof data?.error === 'string' ? data.error : '') || `HTTP ${response.status}`;
  const code = (typeof data?.error === 'string' ? data.error : data?.error?.errors?.[0]?.reason) || `HTTP_${response.status}`;
  return new DriveError(`Google Drive ${action} failed: ${String(reason).slice(0, 200)}`, { status: response.status, code });
}

// Failures before the request reached Google (the body was never sent), so
// a retry is safe. Seen in practice: a brief ETIMEDOUT when the IPv6 and IPv4
// connect attempts both stall.
const CONNECT_ERRORS = new Set(['ETIMEDOUT', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'EAI_AGAIN', 'ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT']);
const RETRY_DELAYS_MS = [400, 1200];

function connectErrorCode(error) {
  const cause = error?.cause;
  const code = cause?.code || cause?.errors?.find((item) => item?.code)?.code || error?.code || '';
  return CONNECT_ERRORS.has(code) ? code : '';
}

// fetch with retries on connect failures; a network failure that remains
// becomes a DriveError (503) rather than undici's bare "fetch failed".
async function send(fetchImpl, url, options, action) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchImpl(url, options);
    } catch (error) {
      if (error instanceof DriveError) throw error;
      const code = connectErrorCode(error);
      if (code && attempt < RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        continue;
      }
      throw new DriveError(`Google Drive ${action} failed: Google could not be reached (${code || 'network error'}). Check the internet connection and try again.`, { status: 503, code: code || 'NETWORK' });
    }
  }
}

async function tokenRequest(fetchImpl, form) {
  const response = await send(fetchImpl, TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString()
  }, 'sign-in');
  const data = await readJson(response);
  if (!response.ok || !data?.access_token) throw errorFrom(response, data, 'sign-in');
  return data;
}

async function exchangeCode({ clientId, clientSecret, redirectUri, code, fetchImpl = globalThis.fetch }) {
  const data = await tokenRequest(fetchImpl, {
    code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code'
  });
  return { accessToken: data.access_token, refreshToken: data.refresh_token || '', expiresIn: Number(data.expires_in || 3600), scope: data.scope || '' };
}

async function revokeToken(token, { fetchImpl = globalThis.fetch } = {}) {
  if (!token) return;
  try {
    await fetchImpl(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  } catch (_error) {
    // Best effort: the token is forgotten locally either way.
  }
}

class DriveClient {
  constructor({ clientId, clientSecret, refreshToken, fetchImpl = globalThis.fetch, onInvalidGrant = null }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.fetchImpl = fetchImpl;
    this.onInvalidGrant = onInvalidGrant;
    this.accessToken = '';
    this.expiresAt = 0;
  }

  async getAccessToken(force = false) {
    if (!force && this.accessToken && Date.now() < this.expiresAt - 60000) return this.accessToken;
    try {
      const data = await tokenRequest(this.fetchImpl, {
        client_id: this.clientId, client_secret: this.clientSecret, refresh_token: this.refreshToken, grant_type: 'refresh_token'
      });
      this.accessToken = data.access_token;
      this.expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
      return this.accessToken;
    } catch (error) {
      // Revoked or expired consent: Drive must be connected again.
      if (error.code === 'invalid_grant' && this.onInvalidGrant) await this.onInvalidGrant();
      throw error;
    }
  }

  // An authorised request; on 401 the token is refreshed once and retried.
  async request(url, options = {}, action = 'request') {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await this.getAccessToken(attempt > 0);
      const response = await send(this.fetchImpl, url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } }, action);
      if (response.status === 401 && attempt === 0) continue;
      if (!response.ok) throw errorFrom(response, await readJson(response), action);
      return response;
    }
    throw new DriveError(`Google Drive ${action} failed: not authorised`, { status: 401, code: 'unauthorized' });
  }

  async getAccount() {
    const response = await this.request(`${API}/about?fields=user(emailAddress,displayName)`, {}, 'account check');
    const data = await readJson(response);
    return { email: data?.user?.emailAddress || '', name: data?.user?.displayName || '' };
  }

  async createFolder(name, parentId = '') {
    const response = await this.request(`${API}/files?fields=id,name,webViewLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) })
    }, 'create folder');
    return readJson(response);
  }

  // null when missing, trashed, or not visible to this app.
  async getFile(id) {
    if (!id) return null;
    try {
      const response = await this.request(`${API}/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size,createdTime,trashed,webViewLink,parents`, {}, 'file lookup');
      const data = await readJson(response);
      return data && !data.trashed ? data : null;
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  // Resumable upload: works for any size (a database dump can be large).
  async uploadFile({ name, parentId, mimeType = 'application/octet-stream', buffer }) {
    const start = await this.request(`${UPLOAD_API}/files?uploadType=resumable&fields=id,name,size,createdTime,webViewLink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(buffer.length)
      },
      body: JSON.stringify({ name, parents: parentId ? [parentId] : undefined })
    }, 'upload');
    const location = start.headers.get('location');
    if (!location) throw new DriveError('Google Drive upload failed: no upload session', { code: 'NO_SESSION' });
    const token = await this.getAccessToken();
    const response = await send(this.fetchImpl, location, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType, 'Content-Length': String(buffer.length) },
      body: buffer
    }, 'upload');
    const data = await readJson(response);
    if (!response.ok || !data?.id) throw errorFrom(response, data, 'upload');
    return data;
  }

  // The folder named `name` directly inside `parentId`, or null.
  async findFolder(parentId, name) {
    const escape = (value) => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = `'${escape(parentId)}' in parents and name = '${escape(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
    const params = new URLSearchParams({ q, pageSize: '1', fields: 'files(id,name)' });
    const response = await this.request(`${API}/files?${params.toString()}`, {}, 'find folder');
    return (await readJson(response))?.files?.[0] || null;
  }

  async listFiles(folderId, { pageSize = 200 } = {}) {
    const q = `'${String(folderId).replace(/'/g, "\\'")}' in parents and trashed = false`;
    const params = new URLSearchParams({ q, orderBy: 'createdTime desc', pageSize: String(pageSize), fields: 'files(id,name,size,createdTime,mimeType)' });
    const response = await this.request(`${API}/files?${params.toString()}`, {}, 'list');
    return (await readJson(response))?.files || [];
  }

  async deleteFile(id) {
    try {
      await this.request(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'delete');
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }

  // A Node stream of the file's content.
  async download(id) {
    const response = await this.request(`${API}/files/${encodeURIComponent(id)}?alt=media`, {}, 'download');
    return response.body ? Readable.fromWeb(response.body) : Readable.from(Buffer.from(await response.arrayBuffer()));
  }
}

module.exports = {
  DriveClient,
  DriveError,
  FOLDER_MIME,
  SCOPE,
  buildAuthUrl,
  exchangeCode,
  revokeToken
};
