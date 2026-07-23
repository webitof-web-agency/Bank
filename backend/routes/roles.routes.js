const express = require('express');
const controller = require('../controllers/roles.controller');
const { requirePermission } = require('../middlewares/auth');

const router = express.Router();

router.get('/', requirePermission('roles.manage'), controller.listController);
router.post('/', requirePermission('roles.manage'), controller.createController);
router.get('/:id', requirePermission('roles.manage'), controller.getController);
router.put('/:id', requirePermission('roles.manage'), controller.updateController);
router.patch('/:id/permissions', requirePermission('roles.manage'), controller.updatePermissionsController);
router.delete('/:id', requirePermission('roles.manage'), controller.deleteController);

module.exports = router;
