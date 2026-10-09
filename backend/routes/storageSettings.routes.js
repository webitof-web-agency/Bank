const express = require('express');
const router = express.Router();
const storageSettingsController = require('../controllers/storageSettings.controller');
const { requirePermission } = require('../middlewares/auth');

// Part of Settings: the one Settings permission (view / create / edit / delete).
router.get('/', requirePermission('settings.read'), storageSettingsController.getSettings);
router.put('/', requirePermission('settings.write'), storageSettingsController.updateSettings);
router.post('/test', requirePermission('settings.write'), storageSettingsController.testConnection);

module.exports = router;
