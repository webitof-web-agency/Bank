const { createPasswordResetRequest, login, resetPasswordWithOtp, buildAccessProfile, changePassword, updateUser } = require('../services/auth.service');
const User = require('../models/user.model');
const { deleteFileById } = require('../services/file.service');

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

    const profile = await updateUser(userId, req.body || {});
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
  meController,
  resetPasswordController,
  updateProfileController
};




