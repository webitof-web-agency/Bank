const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requirePermission } = require('../middlewares/auth');
const recoveryImportController = require('../controllers/recoveryImport.controller');

// One spreadsheet, at most 10 MB (held in memory while it is read).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

// Imports post Recovery From Member vouchers: the Member transactions page.
const view = requirePermission('transactions.member.view');
const create = requirePermission('transactions.member.create');

router.post('/analyze', create, upload.single('file'), recoveryImportController.analyzeFile);
router.post('/upload', create, upload.single('file'), recoveryImportController.uploadFile);
router.get('/upload-jobs/:id', create, recoveryImportController.getUploadJob);
router.get('/batches/:id', view, recoveryImportController.getBatchRows);

module.exports = router;
