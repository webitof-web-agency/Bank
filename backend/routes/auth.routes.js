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

const router = express.Router();

router.post('/login', loginController);
router.post('/forgot-password', forgotPasswordController);
router.post('/reset-password', resetPasswordController);
router.get('/me', requireAuth, meController);
router.patch('/profile', requireAuth, updateProfileController);
router.delete('/avatar', requireAuth, deleteAvatarController);
router.post('/change-password', requireAuth, changePasswordController);

module.exports = router;
