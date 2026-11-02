const { analyzeFileHeaders, uploadAndParseBatch, revalidateBatch, acceptBatch, postBatch } = require('../services/recoveryImport.service');
const { randomUUID } = require('crypto');
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
    
    const args = [req.file.originalname, req.file.buffer, parsedColMap, req.user?.username || 'system'];
    // ?async=1: answer at once with a job id; the rows are checked and saved
    // in the background and GET /upload-jobs/:id reports how far it is.
    if (String(req.query.async || '') === '1') {
      const job = createUploadJob(req.user?.id);
      res.status(202).json({ success: true, data: { jobId: job.id } });
      uploadAndParseBatch(...args, (progress) => Object.assign(job, progress))
        .then((batch) => Object.assign(job, { status: 'done', batch }))
        .catch((error) => {
          console.error('Error in uploadFile (background):', error);
          Object.assign(job, { status: 'error', error: error.message || 'Upload failed' });
        })
        .finally(() => expireUploadJob(job.id));
      return;
    }
    const batch = await uploadAndParseBatch(...args);

    res.json({ success: true, data: batch });
  } catch (error) {
    console.error('Error in uploadFile:', error);
    res.status(400).json({ success: false, error: error.message });
  }
}

// Background uploads, kept in memory for a few minutes after they finish.
const uploadJobs = new Map();
const UPLOAD_JOB_TTL_MS = 10 * 60 * 1000;

function createUploadJob(userId) {
  const job = { id: randomUUID(), userId: userId ?? null, status: 'running', stage: 'read', done: 0, total: 0, batch: null, error: null };
  uploadJobs.set(job.id, job);
  return job;
}

function expireUploadJob(id) {
  const timer = setTimeout(() => uploadJobs.delete(id), UPLOAD_JOB_TTL_MS);
  if (timer.unref) timer.unref();
}

// GET /upload-jobs/:id — the progress of the caller's own background upload.
async function getUploadJob(req, res) {
  const job = uploadJobs.get(String(req.params.id || ''));
  if (!job || (job.userId != null && String(job.userId) !== String(req.user?.id))) {
    return res.status(404).json({ success: false, error: 'Upload not found' });
  }
  const { userId, ...data } = job;
  res.json({ success: true, data });
}

async function getBatches(req, res) {
  try {
    const batches = await RecoveryImportBatch.find().sort({ createdAt: -1 });
    res.json({ success: true, data: batches });
  } catch (error) {
    console.error('Error in getBatches:', error);
    res.status(500).json({ success: false, error: 'Could not load the import batches' });
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
    res.status(500).json({ success: false, error: 'Could not load the import batches' });
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
    res.status(error.statusCode || 400).json({ success: false, error: error.message });
  }
}

module.exports = {
  analyzeFile,
  uploadFile,
  getUploadJob,
  getBatches,
  getBatchRows,
  revalidate,
  accept,
  post
};
