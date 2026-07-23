const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const FileAsset = require('../models/fileAsset.model');
const FileFolder = require('../models/fileFolder.model');
const { toResponse } = require('../utils/mongoose');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');

function ensureSafeName(name = '') {
  return String(name || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .slice(0, 120) || 'file';
}

function splitExt(filename = '') {
  const ext = path.extname(filename || '');
  const base = path.basename(filename || '', ext);
  return { base: ensureSafeName(base), ext };
}

async function ensureUploadRoot() {
  await fsp.mkdir(UPLOAD_ROOT, { recursive: true });
}

async function ensureFolderPath(folderId = null) {
  await ensureUploadRoot();
  const storagePath = folderId ? path.join(UPLOAD_ROOT, 'folders', String(folderId)) : path.join(UPLOAD_ROOT, 'root');
  await fsp.mkdir(storagePath, { recursive: true });
  return storagePath;
}

async function getFolderById(folderId) {
  if (!folderId) return null;
  return FileFolder.findById(folderId).lean();
}

async function listFolders(parentFolderId = null) {
  const folders = await FileFolder.find({ parentFolderId: parentFolderId || null, }).sort({ name: 1 }).lean();
  return folders.map((folder) => ({
    ...folder,
    id: String(folder._id)
  }));
}

async function listFiles({ folderId = null, moduleName = '', entityId = '', search = '' } = {}) {
  const query = { archivedAt: null };
  if (folderId === undefined) {
    // no-op
  } else if (folderId === null || folderId === '') {
    query.folderId = null;
  } else {
    query.folderId = folderId;
  }
  if (moduleName) query.moduleName = moduleName;
  if (entityId) query.entityId = entityId;
  if (search) query.originalName = { $regex: search, $options: 'i' };

  const files = await FileAsset.find(query).sort({ createdAt: -1 }).lean();
  return files.map((file) => ({
    ...file,
    id: String(file._id),
    viewUrl: `/api/files/${file._id}/view`
  }));
}

async function getFileById(fileId) {
  const file = await FileAsset.findById(fileId).lean();
  if (!file) return null;
  return {
    ...file,
    id: String(file._id),
    viewUrl: `/api/files/${file._id}/view`
  };
}

async function createFolder({ name, parentFolderId = null, createdBy = null }) {
  const folder = await FileFolder.create({
    name: ensureSafeName(name),
    parentFolderId: parentFolderId || null,
    createdBy: createdBy || null
  });
  await ensureFolderPath(folder.id);
  return toResponse(folder);
}

async function renameFolder(folderId, name) {
  const folder = await FileFolder.findByIdAndUpdate(
    folderId,
    { $set: { name: ensureSafeName(name) } },
    { new: true }
  );
  return toResponse(folder);
}

async function deleteFolder(folderId) {
  const fileCount = await FileAsset.countDocuments({ folderId, archivedAt: null });
  const childCount = await FileFolder.countDocuments({ parentFolderId: folderId });
  if (fileCount || childCount) {
    const error = new Error('Folder is not empty');
    error.statusCode = 400;
    throw error;
  }
  const deleted = await FileFolder.findByIdAndDelete(folderId).lean();
  return Boolean(deleted);
}

async function saveUploads(files = [], { folderId = null, moduleName = 'general', entityId = '', documentType = '', isPublic = true, createdBy = null } = {}) {
  if (!files.length) {
    const error = new Error('No files uploaded');
    error.statusCode = 400;
    throw error;
  }

  const folderPath = await ensureFolderPath(folderId || null);
  const saved = [];

  for (const file of files) {
    const { base, ext } = splitExt(file.originalname);
    const storedName = `${Date.now()}-${randomUUID()}${ext}`;
    const localPath = path.join(folderPath, storedName);
    await fsp.writeFile(localPath, file.buffer);

    const doc = await FileAsset.create({
      folderId: folderId || null,
      moduleName: String(moduleName || 'general').trim() || 'general',
      entityId: String(entityId || '').trim(),
      originalName: `${base}${ext}`,
      storedName,
      documentType: String(documentType || '').trim(),
      mimeType: file.mimetype || 'application/octet-stream',
      sizeBytes: file.size || file.buffer?.length || 0,
      localPath,
      isPublic: Boolean(isPublic),
      createdBy: createdBy || null
    });

    saved.push({
      ...toResponse(doc),
      viewUrl: `/api/files/${doc.id}/view`
    });
  }

  return saved;
}

async function archiveFile(fileId, archivedBy = null) {
  const file = await FileAsset.findByIdAndUpdate(
    fileId,
    { $set: { archivedAt: new Date(), archivedBy: archivedBy || null } },
    { new: true }
  );
  return file ? {
    ...toResponse(file),
    viewUrl: `/api/files/${file.id}/view`
  } : null;
}

async function deleteFileById(fileId) {
  const file = await FileAsset.findById(fileId).lean();
  if (!file) return false;

  try {
    if (file.localPath && fs.existsSync(file.localPath)) {
      await fsp.unlink(file.localPath);
    }
  } catch {
    // Ignore filesystem errors during cleanup.
  }

  await FileAsset.deleteOne({ _id: fileId });
  return true;
}

async function readFileStream(fileId) {
  const file = await FileAsset.findById(fileId).lean();
  if (!file || !file.localPath || !fs.existsSync(file.localPath)) {
    return null;
  }

  return file;
}

module.exports = {
  archiveFile,
  createFolder,
  deleteFileById,
  deleteFolder,
  ensureFolderPath,
  getFileById,
  getFolderById,
  listFiles,
  listFolders,
  readFileStream,
  renameFolder,
  saveUploads
};
