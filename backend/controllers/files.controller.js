const fs = require('fs');
const path = require('path');
const multer = require('multer');
const {
  archiveFile,
  createFolder,
  deleteFileById,
  deleteFolder,
  getFileById,
  listFiles,
  listFolders,
  readFileStream,
  renameFolder,
  saveUploads
} = require('../services/file.service');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.UPLOAD_MAX_SIZE_BYTES || 25 * 1024 * 1024),
    files: 20
  }
});

const INLINE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'application/pdf']);

async function list(req, res, next) {
  try {
    const data = {
      folders: await listFolders(req.query.folderId || null),
      files: await listFiles({
        folderId: Object.prototype.hasOwnProperty.call(req.query, 'folderId') ? req.query.folderId || null : undefined,
        moduleName: req.query.moduleName || '',
        entityId: req.query.entityId || '',
        search: req.query.search || ''
      })
    };
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getById(req, res, next) {
  try {
    const record = await getFileById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    res.json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

async function uploadFiles(req, res, next) {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    if (!files.length) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    const moduleName = String(req.body.moduleName || 'general').trim() || 'general';
    const entityId = String(req.body.entityId || '').trim();
    const documentType = String(req.body.documentType || '').trim();
    const folderId = req.body.folderId || null;
    const isPublic = String(req.body.isPublic || 'false').toLowerCase() === 'true';
    const uploaded = await saveUploads(files, {
      folderId,
      moduleName,
      entityId,
      documentType,
      isPublic,
      createdBy: req.user?.id || null
    });

    res.status(201).json({ success: true, data: uploaded });
  } catch (error) {
    next(error);
  }
}

// Small images (the society logo, watermark, branding, member photos) are kept
// in memory for an hour after the first view: most live in Google Drive, and
// fetching the logo from Drive on every page load made it slow to appear.
// A file id never changes content (a new upload is a new file), so the copy
// can't go stale; deleting a file drops it.
const IMAGE_CACHE_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_CACHE_MAX_ENTRIES = 50;
const IMAGE_CACHE_TTL_MS = 60 * 60 * 1000;
const imageCache = new Map();

function cachedImage(fileId) {
  const entry = imageCache.get(fileId);
  if (!entry) return null;
  if (Date.now() - entry.at > IMAGE_CACHE_TTL_MS) {
    imageCache.delete(fileId);
    return null;
  }
  return entry;
}

function rememberImage(fileId, entry) {
  imageCache.delete(fileId);
  imageCache.set(fileId, { ...entry, at: Date.now() });
  while (imageCache.size > IMAGE_CACHE_MAX_ENTRIES) imageCache.delete(imageCache.keys().next().value);
}

function forgetImage(fileId) {
  imageCache.delete(String(fileId));
}

function streamToBuffer(stream, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    stream.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        stream.destroy();
        reject(Object.assign(new Error('too large to cache'), { tooLarge: true }));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function sendFileHeaders(res, { mimeType, originalName, storedName }) {
  // Images and PDFs open in the browser; anything else (including files
  // stored before the upload type list, whatever type they claimed) is a
  // download, and a sandbox CSP stops any script in a served file.
  const type = String(mimeType || '').toLowerCase();
  const inline = INLINE_TYPES.has(type);
  const fileName = String(originalName || storedName || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 150);
  res.setHeader('Content-Type', inline ? type : 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${fileName}"`);
  // (Not on PDFs: Chrome won't open its PDF viewer in a sandboxed page.)
  if (type !== 'application/pdf') res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  if (type.startsWith('image/')) {
    // The view URL stays the same for an hour (see utils/file-url.js), so the
    // browser may keep the image that long; never in a shared cache.
    res.setHeader('Cache-Control', 'private, max-age=3600');
  } else {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

async function viewFile(req, res, next) {
  try {
    const fileId = String(req.params.id);
    const hit = cachedImage(fileId);
    if (hit) {
      sendFileHeaders(res, hit);
      return res.end(hit.buffer);
    }

    const result = await readFileStream(fileId);
    if (!result) {
      return res.status(404).send('File not found');
    }

    if (result.signedUrl) {
      return res.redirect(302, result.signedUrl);
    }

    if (!result.stream) {
      return res.status(404).send('File stream could not be created');
    }

    sendFileHeaders(res, result);
    const mimeType = String(result.mimeType || '').toLowerCase();
    const size = Number(result.sizeBytes || 0);
    if (mimeType.startsWith('image/') && INLINE_TYPES.has(mimeType) && size > 0 && size <= IMAGE_CACHE_MAX_BYTES) {
      try {
        const buffer = await streamToBuffer(result.stream, IMAGE_CACHE_MAX_BYTES);
        rememberImage(fileId, { buffer, mimeType: result.mimeType, originalName: result.originalName, storedName: result.storedName });
        return res.end(buffer);
      } catch (error) {
        if (!error.tooLarge) throw error;
        // Bigger than its record said: re-read it and stream it uncached.
        const again = await readFileStream(fileId);
        if (!again?.stream) return res.status(404).send('File stream could not be created');
        return again.stream.pipe(res);
      }
    }
    result.stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

async function archive(req, res, next) {
  try {
    const record = await archiveFile(req.params.id, req.user?.id || null);
    forgetImage(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    res.json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
}

async function createFolderController(req, res, next) {
  try {
    const { name, parentFolderId } = req.body || {};
    if (!name) {
      return res.status(400).json({ success: false, message: 'Folder name is required' });
    }
    const result = await createFolder({
      name,
      parentFolderId: parentFolderId || null,
      createdBy: req.user?.id || null
    });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function renameFolderController(req, res, next) {
  try {
    const { name } = req.body || {};
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    const result = await renameFolder(req.params.id, name);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Folder not found' });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function deleteFolderController(req, res, next) {
  try {
    await deleteFolder(req.params.id);
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    next(error);
  }
}

async function deleteFileController(req, res, next) {
  try {
    const success = await deleteFileById(req.params.id);
    forgetImage(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  archive,
  createFolderController,
  deleteFileController,
  deleteFolderController,
  getById,
  list,
  renameFolderController,
  upload,
  uploadFiles,
  viewFile
};
