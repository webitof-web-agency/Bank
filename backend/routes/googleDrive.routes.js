const express = require('express');
const controller = require('../controllers/googleDrive.controller');
const { requirePermission } = require('../middlewares/auth');

// Signed-in routes (mounted after requireAuth). The OAuth callback is
// mounted separately in routes/index.js, before requireAuth.
const router = express.Router();

router.get('/status', requirePermission('settings.read'), controller.statusController);
router.post('/connect', requirePermission('settings.write'), controller.connectController);
router.post('/disconnect', requirePermission('settings.write'), controller.disconnectController);
router.get('/backups', requirePermission('settings.read'), controller.listBackupsController);
router.post('/backups', requirePermission('settings.write'), controller.startBackupController);
// A backup holds the whole database: settings.write only.
router.get('/backups/:fileId/download', requirePermission('settings.write'), controller.downloadBackupController);

module.exports = router;
