const express = require('express');
const controller = require('../controllers/sms.controller');
const { requirePermission } = require('../middlewares/auth');

// Signed-in routes (mounted after requireAuth). The Flowit webhook is
// mounted separately in routes/index.js, before requireAuth.
const router = express.Router();

router.get('/config/status', requirePermission('settings.read'), controller.configStatusController);
router.get('/templates',requirePermission('settings.read'), controller.listTemplatesController);
router.put('/templates/:eventCode', requirePermission('settings.write'), controller.saveTemplateController);
router.get('/messages', requirePermission('settings.read'), controller.listMessagesController);
// Temporary Flowit connectivity test: administrators only, no input.
router.post('/test-send', requirePermission('settings.write'), controller.testSendController);

module.exports = router;
