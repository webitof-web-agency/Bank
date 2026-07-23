const jwt = require('jsonwebtoken');
const { buildAccessProfile } = require('../services/auth.service');

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing in environment configuration.');
  }
  return process.env.JWT_SECRET;
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

    const decoded = jwt.verify(token, getJwtSecret());
    const userId = decoded.sub || decoded.uid || decoded.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Invalid token payload' });
    }

    const user = await buildAccessProfile(userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User session is invalid or inactive' });
    }

    req.user = user;
    req.auth = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
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
  requirePermission
};
