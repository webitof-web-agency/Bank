const jwt = require('jsonwebtoken');
const ms = require('ms');
const { getFileViewTokenExpiry, getJwtSecret } = require('../config/security');

function cleanText(value = '') {
  return String(value || '').trim();
}

function extractFileIdFromViewUrl(value = '') {
  const match = cleanText(value).match(/\/api\/files\/([^/?#]+)\/view/i);
  return match ? decodeURIComponent(match[1]) : '';
}

// The token's issue time is rounded down to the hour, so a file's view URL
// stays the same for that hour and the browser can reuse its cached copy
// (the society logo used to download again from Google Drive on every page
// load, as each read re-signed it). It still expires FILE_VIEW_TOKEN_EXPIRES_IN
// after that hour began.
// The window is at most half the token lifetime, so a token is always good
// for at least half of it when signed.
function viewTokenBucketSeconds() {
  const expiry = getFileViewTokenExpiry();
  const lifetime = /^\d+$/.test(expiry) ? Number(expiry) : Math.floor((ms(expiry) || 0) / 1000);
  return Math.max(1, Math.min(3600, Math.floor(lifetime / 2)));
}

function signFileViewToken(fileId) {
  const id = cleanText(fileId);
  if (!id) return '';

  const now = Math.floor(Date.now() / 1000);
  const bucket = viewTokenBucketSeconds();
  return jwt.sign(
    {
      fid: id,
      scope: 'file-view',
      iat: now - (now % bucket)
    },
    getJwtSecret(),
    {
      expiresIn: getFileViewTokenExpiry()
    }
  );
}

function buildFileViewUrl(fileIdOrUrl) {
  const value = cleanText(fileIdOrUrl);
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || /^data:/i.test(value)) {
    return value;
  }

  const fileId = extractFileIdFromViewUrl(value) || value;
  const token = signFileViewToken(fileId);
  return token
    ? `/api/files/${encodeURIComponent(fileId)}/view?token=${encodeURIComponent(token)}`
    : `/api/files/${encodeURIComponent(fileId)}/view`;
}

function verifyFileViewToken(token) {
  if (!cleanText(token)) return null;
  const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
  if (decoded?.scope !== 'file-view' || !decoded?.fid) {
    const error = new Error('Invalid file access token');
    error.statusCode = 401;
    throw error;
  }
  return decoded;
}

module.exports = {
  buildFileViewUrl,
  extractFileIdFromViewUrl,
  signFileViewToken,
  verifyFileViewToken
};
