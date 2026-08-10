const jwt = require('jsonwebtoken');
const { getFileViewTokenExpiry, getJwtSecret } = require('../config/security');

function cleanText(value = '') {
  return String(value || '').trim();
}

function extractFileIdFromViewUrl(value = '') {
  const match = cleanText(value).match(/\/api\/files\/([^/?#]+)\/view/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function signFileViewToken(fileId) {
  const id = cleanText(fileId);
  if (!id) return '';

  return jwt.sign(
    {
      fid: id,
      scope: 'file-view'
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
  const decoded = jwt.verify(token, getJwtSecret());
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
