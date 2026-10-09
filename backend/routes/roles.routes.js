const express = require('express');
const controller = require('../controllers/roles.controller');
const { requirePermission } = require('../middlewares/auth');

const router = express.Router();

// The role list also fills the role picker on Employees and the calendar.
router.get('/', requirePermission('admin.roles.view', 'admin.users.view', 'master.employees.view', 'workspace.calendar.create', 'workspace.calendar.edit'), controller.listController);
router.post('/', requirePermission('admin.roles.create'), controller.createController);
router.get('/:id', requirePermission('admin.roles.view'), controller.getController);
router.put('/:id', requirePermission('admin.roles.edit'), controller.updateController);
router.patch('/:id/permissions', requirePermission('admin.roles.edit'), controller.updatePermissionsController);
router.delete('/:id', requirePermission('admin.roles.delete'), controller.deleteController);

module.exports = router;
