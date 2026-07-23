const express = require('express');
const controller = require('../controllers/settings.controller');
const { requirePermission } = require('../middlewares/auth');

const router = express.Router();

router.get('/', requirePermission('settings.read'), controller.getController);
router.put('/', requirePermission('settings.write'), controller.updateController);

module.exports = router;
