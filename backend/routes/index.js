const express = require('express');
const authRoutes = require('./auth.routes');
const filesRoutes = require('./files.routes');
const bankingRoutes = require('./banking.routes');
const notificationsRoutes = require('./notifications.routes');
const notificationsController = require('../controllers/notifications.controller');
const permissionsRoutes = require('./permissions.routes');
const rolesRoutes = require('./roles.routes');
const settingsRoutes = require('./settings.routes');
const usersRoutes = require('./users.routes');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Bank backend is running',
    timestamp: new Date().toISOString()
  });
});
const filesController = require('../controllers/files.controller');
const settingsController = require('../controllers/settings.controller');

router.use('/auth', authRoutes);
router.get('/files/:id/view', filesController.viewFile);
router.get('/settings/public', settingsController.getPublicController);
router.get('/notifications/stream', notificationsController.streamController);

router.use(requireAuth);
router.use('/banking', bankingRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/users', usersRoutes);
router.use('/roles', rolesRoutes);
router.use('/permissions', permissionsRoutes);
router.use('/settings', settingsRoutes);
router.use('/files', filesRoutes);

module.exports = router;
