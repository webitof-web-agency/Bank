const express = require('express');
const controller = require('../controllers/sms.controller');
const { requirePermission } = require('../middlewares/auth');

// Signed-in routes (mounted after requireAuth). The Flowit webhook is
// mounted separately in routes/index.js, before requireAuth.
const router = express.Router();

router.get('/templates', requirePermission('settings.read'), controller.listTemplatesController);
router.put('/templates/:eventCode', requirePermission('settings.write'), controller.saveTemplateController);
router.get('/messages', requirePermission('settings.read'), controller.listMessagesController);

module.exports = router;
