const express = require('express');
const controller = require('../controllers/permissions.controller');
const { requirePermission } = require('../middlewares/auth');

const router = express.Router();

router.get('/', requirePermission('roles.manage'), controller.listController);
router.get('/flat', requirePermission('roles.manage'), controller.flatController);
router.get('/groups', requirePermission('roles.manage'), controller.groupsController);
router.get('/matrix', requirePermission('roles.manage'), controller.matrixController);

module.exports = router;
