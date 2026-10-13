const jwt = require('jsonwebtoken');
const { buildAccessProfile } = require('../services/auth.service');
const { expandPermissionCodes } = require('../config/permissionCatalog');
const { runWithActor } = require('../utils/requestContext');
const { isSessionRevoked } = require('../services/session.service');

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing in environment configuration.');
  }
  return process.env.JWT_SECRET;
}

// A login session token: HS256, not one of the app's other signed tokens
// (file-view links carry `scope`, the Drive OAuth state `purpose`), with a
// session id (jti) that has not been logged out, and not issued before the
// user's last password change. Tokens from before session ids existed have
// no jti and are refused: those users sign in once more.
function verifySessionToken(token) {
  const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
  if (!decoded || typeof decoded !== 'object' || decoded.scope || decoded.purpose || !decoded.jti) return null;
  const userId = decoded.sub || decoded.uid || decoded.userId;
  return userId ? { decoded, userId: String(userId) } : null;
}

function isSessionCurrent(user, decoded) {
  if (!user || !user.isActive) return false;
  const changedAt = user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0;
  // iat is in whole seconds; allow the second the password was changed in.
  return !changedAt || Number(decoded.iat || 0) * 1000 >= changedAt - 1000;
}

async function resolveSessionUser(token) {
  const session = verifySessionToken(token);
  if (!session || await isSessionRevoked(session.decoded.jti)) return null;
  const user = await buildAccessProfile(session.userId);
  return isSessionCurrent(user, session.decoded) ? { user, decoded: session.decoded } : null;
}

function extractBearerToken(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return '';
  return header.slice(7).trim();
}

async function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication token is required' });
    }

    const session = await resolveSessionUser(token);
    if (!session) {
      return res.status(401).json({ success: false, message: 'User session is invalid or inactive' });
    }
    const { user, decoded } = session;

    req.user = user;
    req.auth = decoded;
    // Everything downstream (route handler, service calls, DB writes) runs as
    // an async continuation of this call, so AsyncLocalStorage carries the
    // actor id all the way down to persistMainRow/deleteMainRow in
    // config/postgres.js for audit-log attribution, with no need to pass a
    // user id through every function signature in between.
    return runWithActor(user.id, () => next());
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (user.isSuperAdmin) return true;

  const grantedPermissions = new Set(expandPermissionCodes(Array.isArray(user.permissions) ? user.permissions : []));
  const requestedPermissions = expandPermissionCodes([permission]);
  return requestedPermissions.some((code) => grantedPermissions.has(code));
}

function requirePermission(...permissions) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (user.isSuperAdmin) return next();
    if (!permissions.length) return next();
    const allowed = permissions.some((permission) => hasPermission(user, permission));
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: `Missing permission: ${permissions.join(' OR ')}`
      });
    }
    return next();
  };
}

module.exports = {
  hasPermission,
  requireAuth,
  isSessionCurrent,
  requirePermission,
  resolveSessionUser,
  verifySessionToken
};
