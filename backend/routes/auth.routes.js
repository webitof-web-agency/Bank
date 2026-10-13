const express = require('express');
const {
  forgotPasswordController,
  loginController,
  logoutController,
  meController,
  resetPasswordController,
  updateProfileController,
  deleteAvatarController,
  changePasswordController
} = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth');
const { accountRateLimit, authRateLimit } = require('../middlewares/rateLimit');

const router = express.Router();

router.post('/login', authRateLimit, accountRateLimit, loginController);
router.post('/forgot-password', authRateLimit, accountRateLimit, forgotPasswordController);
router.post('/reset-password', authRateLimit, accountRateLimit, resetPasswordController);
router.post('/logout', requireAuth, logoutController);
router.get('/me', requireAuth, meController);
router.patch('/profile', requireAuth, updateProfileController);
router.delete('/avatar', requireAuth, deleteAvatarController);
router.post('/change-password', requireAuth, changePasswordController);

module.exports = router;
