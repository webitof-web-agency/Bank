const { createPasswordResetRequest, login, resetPasswordWithOtp, buildAccessProfile, changePassword, updateUser } = require('../services/auth.service');
const User = require('../models/user.model');
const { deleteFileById, getFileById } = require('../services/file.service');
const { purgeExpiredSessions, revokeSession } = require('../services/session.service');

// The only fields a user may change on their own profile. Roles, branch,
// status, login names, password and HR fields are set by an administrator.
const SELF_PROFILE_FIELDS = ['fullName', 'name', 'mobileNo', 'gender', 'address'];

async function loginController(req, res, next) {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'identifier and password are required' });
    }
    const result = await login({ identifier, password });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// Ends this session on the server: the token stops working at once, even
// if a copy of it was kept somewhere.
async function logoutController(req, res, next) {
  try {
    await revokeSession({ jti: req.auth?.jti, userId: req.user?.id, exp: req.auth?.exp });
    purgeExpiredSessions().catch((error) => console.error('[auth] purge of expired sessions failed:', error.message));
    res.json({ success: true, data: { message: 'Logged out' } });
  } catch (error) {
    next(error);
  }
}

async function meController(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const profile = await buildAccessProfile(userId);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
}

async function forgotPasswordController(req, res, next) {
  try {
    const { identifier } = req.body || {};
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'identifier is required' });
    }

    const result = await createPasswordResetRequest(identifier, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || ''
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function resetPasswordController(req, res, next) {
  try {
    const { identifier, otp, password, confirmPassword } = req.body || {};
    if (!identifier || !otp || !password) {
      return res.status(400).json({ success: false, message: 'identifier, otp and password are required' });
    }
    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'password and confirmPassword must match' });
    }

    const result = await resetPasswordWithOtp({ identifier, otp, password });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function updateProfileController(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const body = req.body || {};
    const patch = {};
    for (const field of SELF_PROFILE_FIELDS) {
      if (body[field] !== undefined) patch[field] = String(body[field] ?? '');
    }
    // A new avatar must be a file this user uploaded, so a profile can't be
    // pointed at someone else's document (and later delete it on change).
    if (body.avatarFileId) {
      const file = await getFileById(String(body.avatarFileId));
      if (!file || String(file.createdBy || '') !== String(userId) || !/^image\//i.test(String(file.mimeType || ''))) {
        return res.status(400).json({ success: false, message: 'Invalid avatar file' });
      }
      patch.avatarFileId = file.id;
      patch.avatarUrl = '';
    }

    const profile = await updateUser(userId, patch, { actorUser: req.user });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
}

async function deleteAvatarController(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const avatarFileId = user.avatarFileId ? String(user.avatarFileId) : '';
    user.avatarUrl = '';
    user.avatarFileId = null;
    await user.save();

    if (avatarFileId) {
      await deleteFileById(avatarFileId).catch(() => {});
    }

    const profile = await buildAccessProfile(userId);
    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
}

async function changePasswordController(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'newPassword and confirmPassword must match' });
    }

    const result = await changePassword(userId, currentPassword, newPassword);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  changePasswordController,
  deleteAvatarController,
  forgotPasswordController,
  loginController,
  logoutController,
  meController,
  resetPasswordController,
  updateProfileController
};




