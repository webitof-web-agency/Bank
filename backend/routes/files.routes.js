const express = require('express');
const controller = require('../controllers/files.controller');
const { requirePermission } = require('../middlewares/auth');

const router = express.Router();

router.get('/', requirePermission('files.read'), controller.list);
router.post('/upload', requirePermission('files.write'), controller.upload.any(), controller.uploadFiles);
router.post('/folders', requirePermission('files.write'), controller.createFolderController);
router.put('/folders/:id', requirePermission('files.write'), controller.renameFolderController);
router.delete('/folders/:id', requirePermission('files.delete'), controller.deleteFolderController);
router.get('/:id', requirePermission('files.read'), controller.getById);
router.patch('/:id/archive', requirePermission('files.write'), controller.archive);
router.delete('/:id', requirePermission('files.delete'), controller.deleteFileController);

module.exports = router;
