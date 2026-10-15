'use strict';

// Auth guard for the member/employee mobile-app portal. These tokens are
// issued by appPortal.service.login with scope "app" and are deliberately
// separate from the admin/staff session (requireAuth): an app token can only
// reach /api/app/me/* and only ever sees its own account's data.

const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/security');

function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const [scheme, value] = String(header).split(' ');
  if (scheme && /^Bearer$/i.test(scheme) && value) return value.trim();
  return '';
}

function requireAppAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication token is required' });
    }
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    if (!decoded || decoded.scope !== 'app' || !decoded.sub) {
      return res.status(401).json({ success: false, message: 'Invalid app session' });
    }
    req.principal = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
}

module.exports = { requireAppAuth };
