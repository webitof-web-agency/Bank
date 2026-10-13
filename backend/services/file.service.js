const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const FileAsset = require('../models/fileAsset.model');
const FileFolder = require('../models/fileFolder.model');
const { toResponse } = require('../utils/response');
const { buildFileViewUrl } = require('../utils/file-url');
const StorageService = require('./storage/storage.service');
const { buildStorageKey } = require('../utils/uploadPath');

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

// File types that may be uploaded, and the type each is stored and served
// as. The browser's own Content-Type is not trusted: an uploaded .html or
// .svg served as such would run script in the app's origin.
const UPLOAD_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.heic': 'image/heic', '.heif': 'image/heif',
  '.tif': 'image/tiff', '.tiff': 'image/tiff',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain', '.csv': 'text/csv', '.rtf': 'application/rtf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.zip': 'application/zip'
};

function uploadMimeType(ext = '') {
  return UPLOAD_TYPES[String(ext || '').toLowerCase()] || '';
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  if (search) query.originalName = { $regex: escapeRegex(String(search).slice(0, 200)), $options: 'i' };

  const files = await FileAsset.find(query).sort({ createdAt: -1 }).lean();
  return files.map((file) => ({
    ...file,
    id: String(file._id),
    viewUrl: buildFileViewUrl(file._id)
  }));
}

async function getFileById(fileId) {
  const file = await FileAsset.findById(fileId).lean();
  if (!file) return null;
  return {
    ...file,
    id: String(file._id),
    viewUrl: buildFileViewUrl(file._id)
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

// The record an upload belongs to, for its folder: transaction documents go
// under their voucher type (recovery, advance-paid, ...) and every record's
// files under its unique code (member code, employee code, voucher number).
// Pages upload with the saved record's id as entityId.
async function resolveUploadTarget(moduleName, entityId) {
  const module = String(moduleName || '').trim().toLowerCase();
  const id = String(entityId || '').trim();
  if (!id) return { voucherKey: '', code: '' };
  try {
    if (module === 'transactions') {
      const { Voucher } = require('../models/banking.models');
      const voucher = await Voucher.findById(id).lean();
      return { voucherKey: voucher?.details?.key || '', code: voucher?.voucherNo || '' };
    }
    if (module === 'members' || module === 'member') {
      const { Member } = require('../models/banking.models');
      const member = await Member.findById(id).lean();
      return { voucherKey: '', code: member?.code || '' };
    }
    if (module === 'employees' || module === 'employee' || module === 'users') {
      const { staffCodeFromId } = require('./auth.service');
      const staffCode = staffCodeFromId(id);
      if (staffCode) return { voucherKey: '', code: staffCode };
      const User = require('../models/user.model');
      const user = await User.findById(id).lean();
      return { voucherKey: '', code: user?.employeeCode || user?.code || '' };
    }
  } catch (_error) {
    // Unknown id: the file still saves, just without the code folder.
  }
  return { voucherKey: '', code: '' };
}

async function saveUploads(files = [], { folderId = null, moduleName = 'general', entityId = '', documentType = '', isPublic = false, createdBy = null } = {}) {
  if (!files.length) {
    const error = new Error('No files uploaded');
    error.statusCode = 400;
    throw error;
  }

  const folderPath = await ensureFolderPath(folderId || null);
  const saved = [];
  const { voucherKey, code } = await resolveUploadTarget(moduleName, entityId);

  for (const file of files) {
    const maxSize = Number(process.env.UPLOAD_MAX_SIZE_BYTES || 25 * 1024 * 1024);
    if ((file.size || file.buffer?.length) > maxSize) {
      const error = new Error('File exceeds maximum allowed size');
      error.statusCode = 400;
      throw error;
    }
    if (!file.buffer || !file.buffer.length) {
      const error = new Error('File content is empty');
      error.statusCode = 400;
      throw error;
    }

    const { base, ext: rawExt } = splitExt(file.originalname);
    const ext = rawExt.toLowerCase();
    const mimeType = uploadMimeType(ext);
    if (!mimeType) {
      const error = new Error(`File type not allowed: ${ext || '(none)'}. Allowed: ${Object.keys(UPLOAD_TYPES).join(' ')}`);
      error.statusCode = 400;
      throw error;
    }

    const modDir = String(moduleName || 'general').trim() || 'general';
    const entDir = String(entityId || '').trim();
    // The original name, kept readable, plus a short unique suffix.
    const storedName = `${base.replace(/\s+/g, '-')}-${Date.now().toString(36)}${randomUUID().slice(0, 4)}${ext}`;
    const storageKey = buildStorageKey({ moduleName: modDir, voucherKey, code, storedName });

    const locator = await StorageService.upload(file.buffer, storageKey, { mimeType });

    const doc = await FileAsset.create({
      folderId: folderId || null,
      moduleName: modDir,
      entityId: entDir,
      originalName: `${base}${ext}`,
      storedName,
      documentType: String(documentType || '').trim(),
      mimeType,
      sizeBytes: file.size || file.buffer?.length || 0,
      localPath: locator.storageProvider === 'local' ? path.join(folderPath, storedName) : null,
      storageProvider: locator.storageProvider,
      storageKey: locator.storageKey,
      storageBucket: locator.storageBucket,
      storageRegion: locator.storageRegion,
      storageProject: locator.storageProject,
      isPublic: Boolean(isPublic),
      createdBy: createdBy || null
    });

    saved.push({
      ...toResponse(doc),
      viewUrl: buildFileViewUrl(doc.id)
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
    viewUrl: buildFileViewUrl(file.id)
  } : null;
}

async function deleteFileById(fileId) {
  const file = await FileAsset.findById(fileId).lean();
  if (!file) return false;

  await StorageService.delete(file);
  await FileAsset.deleteOne({ _id: fileId });
  return true;
}

async function readFileStream(fileId) {
  const file = await FileAsset.findById(fileId).lean();
  if (!file) {
    return null;
  }

  const signedUrl = await StorageService.getSignedUrl(file);
  let stream = null;
  if (!signedUrl) {
    stream = await StorageService.getStream(file);
    if (!stream && file.localPath && fs.existsSync(file.localPath)) {
      stream = fs.createReadStream(file.localPath);
    }
  }

  return { ...file, signedUrl, stream };
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
