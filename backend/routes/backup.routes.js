const express = require('express');
const controller = require('../controllers/googleDrive.controller');
const { requirePermission } = require('../middlewares/auth');

// Manual database backup, downloaded to the user's computer. A backup holds
// the whole database: settings.write only.
const router = express.Router();

router.get('/download', requirePermission('settings.write'), controller.downloadLocalBackupController);

module.exports = router;
