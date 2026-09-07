const { analyzeFileHeaders, uploadAndParseBatch, revalidateBatch, acceptBatch, postBatch } = require('../services/recoveryImport.service');
const { RecoveryImportBatch, RecoveryImportRow } = require('../models/banking.models');

/**
 * POST /recovery-import/analyze
 * Reads only the headers of an uploaded Excel to detect legacy template.
 * Does NOT persist anything. Returns { headers, isLegacy, colMap }.
 */
async function analyzeFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    const result = analyzeFileHeaders(req.file.buffer);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error in analyzeFile:', error);
    res.status(400).json({ success: false, error: error.message });
  }
}

async function uploadFile(req, res) {
  try {
    const { colMap } = req.body;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    let parsedColMap;
    try {
      parsedColMap = typeof colMap === 'string' ? JSON.parse(colMap) : colMap;
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid column mapping' });
    }
    
    const meta = { actorUser: req.user, actorUserId: req.user?.id };
    const batch = await uploadAndParseBatch(
      req.file.originalname,
      req.file.buffer,
      parsedColMap,
      req.user?.username || 'system'
    );
    
    res.json({ success: true, data: batch });
  } catch (error) {
    console.error('Error in uploadFile:', error);
    res.status(400).json({ success: false, error: error.message });
  }
}

async function getBatches(req, res) {
  try {
    const batches = await RecoveryImportBatch.find().sort({ createdAt: -1 });
    res.json({ success: true, data: batches });
  } catch (error) {
    console.error('Error in getBatches:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function getBatchRows(req, res) {
  try {
    const { id } = req.params;
    const batch = await RecoveryImportBatch.findById(id);
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });
    
    const rows = await RecoveryImportRow.find({ batchId: id }).sort({ sourceRowNo: 1 });
    res.json({ success: true, data: { batch, rows } });
  } catch (error) {
    console.error('Error in getBatchRows:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function revalidate(req, res) {
  try {
    const { id } = req.params;
    const batch = await revalidateBatch(id);
    res.json({ success: true, data: batch });
  } catch (error) {
    console.error('Error in revalidate:', error);
    res.status(400).json({ success: false, error: error.message });
  }
}

async function accept(req, res) {
  try {
    const { id } = req.params;
    const batch = await acceptBatch(id);
    res.json({ success: true, data: batch });
  } catch (error) {
    console.error('Error in accept:', error);
    res.status(400).json({ success: false, error: error.message });
  }
}

async function post(req, res) {
  try {
    const { id } = req.params;
    const meta = { actorUser: req.user, actorUserId: req.user?.id };
    const batch = await postBatch(id, meta);
    res.json({ success: true, data: batch });
  } catch (error) {
    console.error('Error in post:', error);
    res.status(400).json({ success: false, error: error.message });
  }
}

module.exports = {
  analyzeFile,
  uploadFile,
  getBatches,
  getBatchRows,
  revalidate,
  accept,
  post
};
