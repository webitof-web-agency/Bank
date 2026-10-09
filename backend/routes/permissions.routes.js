const express = require('express');
const controller = require('../controllers/permissions.controller');
const { requirePermission } = require('../middlewares/auth');

const router = express.Router();

router.get('/', requirePermission('admin.roles.view'), controller.listController);
router.get('/flat', requirePermission('admin.roles.view'), controller.flatController);
router.get('/groups', requirePermission('admin.roles.view'), controller.groupsController);
router.get('/matrix', requirePermission('admin.roles.view'), controller.matrixController);

module.exports = router;
