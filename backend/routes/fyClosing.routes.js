const express = require('express');
const controller = require('../controllers/fyClosing.controller');
const { requirePermission } = require('../middlewares/auth');

// Year-end close: part of Settings (the one Settings permission).
const router = express.Router();

router.get('/', requirePermission('settings.read'), controller.listController);
router.get('/:fy/preview', requirePermission('settings.read'), controller.previewController);
router.post('/:fy/close', requirePermission('settings.write'), controller.closeController);
router.post('/:fy/reopen', requirePermission('settings.write'), controller.reopenController);

module.exports = router;
