const express = require('express');
const helmet = require('helmet');
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
const { requireFileViewAccess } = require('../middlewares/fileAccess');

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
const smsController = require('../controllers/sms.controller');

router.use('/auth', authRoutes);
// helmet()'s default Cross-Origin-Resource-Policy: same-origin blocks the
// browser from rendering these images when the frontend runs on a different
// origin (e.g. Vite dev server on :5173 vs API on :8001) — <img src> to a
// cross-origin URL is otherwise silently refused, showing a broken image icon.
router.get('/files/:id/view', helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }), requireFileViewAccess, filesController.viewFile);
router.get('/settings/public', settingsController.getPublicController);
router.get('/notifications/stream', notificationsController.streamController);
router.post('/sms/flowit/webhook', smsController.flowitWebhookController);
// Google sends the browser here after "Connect Google Drive" (no app login).
router.get('/google-drive/oauth/callback', require('../controllers/googleDrive.controller').oauthCallbackController);

router.use(requireAuth);
router.use('/banking', bankingRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/users', usersRoutes);
router.use('/roles', rolesRoutes);
router.use('/permissions', permissionsRoutes);
router.use('/settings/storage', require('./storageSettings.routes'));
router.use('/settings', settingsRoutes);
router.use('/files', filesRoutes);
router.use('/recovery-import', require('./recoveryImport.routes'));
router.use('/sms', require('./sms.routes'));
router.use('/google-drive', require('./googleDrive.routes'));
router.use('/backup', require('./backup.routes'));

module.exports = router;
