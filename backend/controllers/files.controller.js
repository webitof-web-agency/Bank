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
    fileSize: Number(process.env.UPLOAD_MAX_SIZE_BYTES || 25 * 1024 * 1024)
  }
});

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

async function viewFile(req, res, next) {
  try {
    const file = await readFileStream(req.params.id);
    if (!file) {
      return res.status(404).send('File not found');
    }

    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(file.localPath).pipe(res);
  } catch (error) {
    next(error);
  }
}

async function archive(req, res, next) {
  try {
    const record = await archiveFile(req.params.id, req.user?.id || null);
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
