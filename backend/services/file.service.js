const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const FileAsset = require('../models/fileAsset.model');
const FileFolder = require('../models/fileFolder.model');
const { toResponse } = require('../utils/mongoose');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const MODULE_ROOT_NAMES = {
  employees: 'Employees',
  members: 'Members'
};

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

function getModuleRootName(moduleName = '') {
  const key = String(moduleName || '').trim().toLowerCase();
  if (MODULE_ROOT_NAMES[key]) return MODULE_ROOT_NAMES[key];
  return ensureSafeName(key ? key.replace(/[-_]+/g, ' ') : 'Files');
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

function getDocumentFileIds(documents = {}) {
  return [...new Set(
    Object.values(documents || {})
      .map((document) => document?.fileId || document?.id || null)
      .filter(Boolean)
      .map((fileId) => String(fileId))
  )];
}

async function deleteDocumentFiles(documents = {}) {
  const fileIds = getDocumentFileIds(documents);
  await Promise.allSettled(fileIds.map((fileId) => deleteFileById(fileId)));
}

async function upsertFolderRecord({
  name,
  parentFolderId = null,
  createdBy = null,
  payload = {}
}) {
  const normalizedName = ensureSafeName(name);
  const folderQuery = {
    parentFolderId: parentFolderId || null,
    name: normalizedName
  };

  let folder = await FileFolder.findOne(folderQuery);
  if (folder) {
    const nextPayload = { ...(folder.payload || {}), ...(payload || {}) };
    const updates = {};
    if (JSON.stringify(folder.payload || {}) !== JSON.stringify(nextPayload)) {
      updates.payload = nextPayload;
    }
    if (!folder.createdBy && createdBy) {
      updates.createdBy = createdBy;
    }
    if (Object.keys(updates).length > 0) {
      folder = await FileFolder.findByIdAndUpdate(folder._id, { $set: updates }, { new: true });
    }
    return toResponse(folder);
  }

  try {
    folder = await FileFolder.create({
      name: normalizedName,
      parentFolderId: parentFolderId || null,
      createdBy: createdBy || null,
      payload: payload || {}
    });
    await ensureFolderPath(folder.id);
    return toResponse(folder);
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await FileFolder.findOne(folderQuery);
      if (existing) return toResponse(existing);
    }
    throw error;
  }
}

async function ensureModuleFolder(moduleName, { createdBy = null } = {}) {
  const moduleKey = String(moduleName || '').trim().toLowerCase();
  const rootName = getModuleRootName(moduleKey);
  return upsertFolderRecord({
    name: rootName,
    parentFolderId: null,
    createdBy,
    payload: { moduleName: moduleKey }
  });
}

async function ensureEntityFolder({
  moduleName,
  entityId = '',
  entityName = '',
  entityCode = '',
  createdBy = null
} = {}) {
  const moduleKey = String(moduleName || '').trim().toLowerCase();
  const rootFolder = await ensureModuleFolder(moduleKey, { createdBy });
  const normalizedEntityId = String(entityId || '').trim();
  const baseName = ensureSafeName(entityName || entityCode || normalizedEntityId || moduleKey || 'Item');
  const payload = {
    moduleName: moduleKey,
    entityId: normalizedEntityId,
    entityName: baseName,
    entityCode: String(entityCode || '').trim()
  };

  let folder = normalizedEntityId
    ? await FileFolder.findOne({
      parentFolderId: rootFolder.id,
      'payload.moduleName': moduleKey,
      'payload.entityId': normalizedEntityId
    })
    : null;

  if (!folder) {
    folder = await FileFolder.findOne({
      parentFolderId: rootFolder.id,
      name: baseName
    });
    if (folder && normalizedEntityId) {
      const existingEntityId = String(folder.payload?.entityId || '').trim();
      if (existingEntityId && existingEntityId !== normalizedEntityId) {
        folder = null;
      }
    }
  }

  if (!folder) {
    try {
      folder = await FileFolder.create({
        name: baseName,
        parentFolderId: rootFolder.id,
        createdBy: createdBy || null,
        payload
      });
      await ensureFolderPath(folder.id);
      return toResponse(folder);
    } catch (error) {
      if (error?.code === 11000) {
        const fallbackName = ensureSafeName(
          `${baseName}-${String(normalizedEntityId || entityCode || Date.now()).slice(-6)}`
        );
        folder = await FileFolder.create({
          name: fallbackName,
          parentFolderId: rootFolder.id,
          createdBy: createdBy || null,
          payload
        });
        await ensureFolderPath(folder.id);
        return toResponse(folder);
      }
      throw error;
    }
  }

  const nextPayload = { ...(folder.payload || {}), ...payload };
  const updates = {};
  if (JSON.stringify(folder.payload || {}) !== JSON.stringify(nextPayload)) {
    updates.payload = nextPayload;
  }
  if (!folder.createdBy && createdBy) {
    updates.createdBy = createdBy;
  }
  if (folder.name !== baseName) {
    const nameConflict = await FileFolder.findOne({
      parentFolderId: rootFolder.id,
      name: baseName,
      _id: { $ne: folder._id }
    });
    if (!nameConflict) {
      updates.name = baseName;
    }
  }

  if (Object.keys(updates).length > 0) {
    folder = await FileFolder.findByIdAndUpdate(folder._id, { $set: updates }, { new: true });
  }

  return toResponse(folder);
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
  deleteDocumentFiles,
  deleteFileById,
  deleteFolder,
  ensureFolderPath,
  ensureEntityFolder,
  ensureModuleFolder,
  getFileById,
  getFolderById,
  listFiles,
  listFolders,
  readFileStream,
  renameFolder,
  saveUploads
};
