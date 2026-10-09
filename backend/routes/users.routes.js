const express = require('express');
const controller = require('../controllers/users.controller');
const { requirePermission } = require('../middlewares/auth');

// User accounts are managed from Master -> Employees (the old Users page
// redirects there), so either page's permission for the same action works.
const router = express.Router();

const can = (action) => requirePermission(`admin.users.${action}`, `master.employees.${action}`);

// The calendar's "visible to" picker lists users too.
router.get('/lookup', requirePermission('admin.users.view', 'master.employees.view', 'workspace.calendar.create', 'workspace.calendar.edit'), controller.lookupController);
router.get('/', can('view'), controller.listController);
router.post('/', can('create'), controller.createController);
router.get('/:id', can('view'), controller.getController);
router.put('/:id', can('edit'), controller.updateController);
router.delete('/:id', can('delete'), controller.deleteController);
// Restoring undoes a delete: the same permission.
router.post('/:id/restore', can('delete'), controller.restoreController);

module.exports = router;
