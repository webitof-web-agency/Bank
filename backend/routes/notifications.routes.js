const express = require('express');
const controller = require('../controllers/notifications.controller');
const { requirePermission } = require('../middlewares/auth');

// A user only ever sees and changes their own notifications; sending one to
// other users needs Create.
const router = express.Router();

const view = requirePermission('workspace.notifications.view');
router.get('/', view, controller.listController);
router.get('/unread-count', view, controller.unreadCountController);
router.post('/', requirePermission('workspace.notifications.create'), controller.createController);
router.patch('/read-all', view, controller.markAllReadController);
router.patch('/:id/read', view, controller.markReadController);
router.get('/:id', view, controller.getController);
router.delete('/:id', requirePermission('workspace.notifications.delete'), controller.deleteController);

module.exports = router;
