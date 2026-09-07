const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, requirePermission } = require('../middlewares/auth');
const recoveryImportController = require('../controllers/recoveryImport.controller');

const upload = multer({ storage: multer.memoryStorage() });

router.use(requireAuth);
router.use(requirePermission('transactions.write'));

router.post('/analyze', upload.single('file'), recoveryImportController.analyzeFile);
router.post('/upload', upload.single('file'), recoveryImportController.uploadFile);
router.get('/batches', recoveryImportController.getBatches);
router.get('/batches/:id', recoveryImportController.getBatchRows);
router.post('/batches/:id/revalidate', recoveryImportController.revalidate);
router.post('/batches/:id/accept', recoveryImportController.accept);
router.post('/batches/:id/post', recoveryImportController.post);

module.exports = router;
