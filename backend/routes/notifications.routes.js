const express = require('express');
const controller = require('../controllers/notifications.controller');

const router = express.Router();

router.get('/', controller.listController);
router.get('/unread-count', controller.unreadCountController);
router.post('/', controller.createController);
router.patch('/read-all', controller.markAllReadController);
router.patch('/:id/read', controller.markReadController);
router.get('/:id', controller.getController);
router.delete('/:id', controller.deleteController);

module.exports = router;
