const { buildAccessProfile } = require('../services/auth.service');
const { verifyFileViewToken } = require('../utils/file-url');

function extractViewToken(req) {
  return String(req.query.token || req.headers['x-file-access-token'] || '').trim();
}

async function requireFileViewAccess(req, res, next) {
  try {
    const token = extractViewToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'File access token is required' });
    }

    const decoded = verifyFileViewToken(token);
    if (!decoded || String(decoded.fid) !== String(req.params.id)) {
      return res.status(401).json({ success: false, message: 'Invalid file access token' });
    }

    const userId = decoded.sub || decoded.uid || decoded.userId || null;
    if (userId) {
      const user = await buildAccessProfile(userId);
      if (!user || !user.isActive) {
        return res.status(401).json({ success: false, message: 'User session is invalid or inactive' });
      }
      req.fileAccess = {
        fileId: String(decoded.fid),
        userId: String(user.id || user._id || userId)
      };
    } else {
      req.fileAccess = {
        fileId: String(decoded.fid),
        userId: null
      };
    }

    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
}

module.exports = {
  requireFileViewAccess
};
