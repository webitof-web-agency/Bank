const express = require('express');
const controller = require('../controllers/files.controller');
const { requirePermission } = require('../middlewares/auth');

const router = express.Router();

router.get('/', requirePermission('workspace.files.view'), controller.list);
router.post('/upload', requirePermission('workspace.files.create'), controller.upload.any(), controller.uploadFiles);
router.post('/folders', requirePermission('workspace.files.create'), controller.createFolderController);
router.put('/folders/:id', requirePermission('workspace.files.edit'), controller.renameFolderController);
router.delete('/folders/:id', requirePermission('workspace.files.delete'), controller.deleteFolderController);
router.get('/:id', requirePermission('workspace.files.view'), controller.getById);
router.patch('/:id/archive', requirePermission('workspace.files.edit'), controller.archive);
router.delete('/:id', requirePermission('workspace.files.delete'), controller.deleteFileController);

module.exports = router;
