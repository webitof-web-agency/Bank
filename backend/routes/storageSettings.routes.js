const express = require('express');
const router = express.Router();
const storageSettingsController = require('../controllers/storageSettings.controller');
const { requireAuth, requirePermission } = require('../middlewares/auth');

router.use(requireAuth);
// Ensure only admins can access storage settings
router.use(requirePermission('settings_manage'));

router.get('/', storageSettingsController.getSettings);
router.put('/', storageSettingsController.updateSettings);
router.post('/test', storageSettingsController.testConnection);

module.exports = router;
