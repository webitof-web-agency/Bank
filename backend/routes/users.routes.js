const express = require('express');
const controller = require('../controllers/users.controller');
const { requirePermission } = require('../middlewares/auth');

const router = express.Router();

router.get('/lookup', requirePermission('users.manage'), controller.lookupController);
router.get('/', requirePermission('users.manage'), controller.listController);
router.post('/', requirePermission('users.manage'), controller.createController);
router.get('/:id', requirePermission('users.manage'), controller.getController);
router.put('/:id', requirePermission('users.manage'), controller.updateController);
router.delete('/:id', requirePermission('users.manage'), controller.deleteController);
router.post('/:id/restore', requirePermission('users.manage'), controller.restoreController);

module.exports = router;
