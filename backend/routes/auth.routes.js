const express = require('express');
const {
  forgotPasswordController,
  loginController,
  meController,
  resetPasswordController,
  updateProfileController,
  deleteAvatarController,
  changePasswordController
} = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth');
const { authRateLimit } = require('../middlewares/rateLimit');

const router = express.Router();

router.post('/login', authRateLimit, loginController);
router.post('/forgot-password', authRateLimit, forgotPasswordController);
router.post('/reset-password', authRateLimit, resetPasswordController);
router.get('/me', requireAuth, meController);
router.patch('/profile', requireAuth, updateProfileController);
router.delete('/avatar', requireAuth, deleteAvatarController);
router.post('/change-password', requireAuth, changePasswordController);

module.exports = router;
