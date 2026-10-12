// Uploaded files (member photos, documents) in the connected Google Drive's
// "Uploads" folder. The file record keeps the Drive file id as storageKey
// and the folder id as storageBucket; files are served through the app
// (/api/files/:id/view), never by a public Drive link.
const connection = require('../../googleDrive/driveConnection.service');

// Folder ids by "<parent id>/<name>", and lookups in flight, so concurrent
// uploads into a new month don't create the same folder twice.
const folderIds = new Map();
const pendingFolders = new Map();

class GoogleDriveStorageProvider {
  // The storage key's folders, mirrored under the Uploads folder:
  // 2026/oct/recovery/photo.png -> Uploads/2026/oct/recovery/photo.png.
  _splitKey(storageKey) {
    if (!storageKey) throw new Error('Storage key is required');
    const segments = String(storageKey).replace(/^\/+/, '').split('/').filter(Boolean);
    return { folders: segments.slice(0, -1), name: segments[segments.length - 1] };
  }

  async _folderIn(client, parentId, name) {
    const cacheKey = `${parentId}/${name}`;
    if (folderIds.has(cacheKey)) return folderIds.get(cacheKey);
    if (!pendingFolders.has(cacheKey)) {
      pendingFolders.set(cacheKey, (async () => {
        const folder = await client.findFolder(parentId, name) || await client.createFolder(name, parentId);
        folderIds.set(cacheKey, folder.id);
        return folder.id;
      })().finally(() => pendingFolders.delete(cacheKey)));
    }
    return pendingFolders.get(cacheKey);
  }

  async _ensurePath(client, rootId, folders) {
    let parentId = rootId;
    for (const name of folders) parentId = await this._folderIn(client, parentId, name);
    return parentId;
  }

  async upload(buffer, storageKey, { mimeType } = {}) {
    const client = await connection.getClient();
    const rootId = await connection.ensureFolder('uploads', client);
    const { folders, name } = this._splitKey(storageKey);
    const send = async () => client.uploadFile({ name, parentId: await this._ensurePath(client, rootId, folders), mimeType: mimeType || 'application/octet-stream', buffer });
    let file;
    try {
      file = await send();
    } catch (error) {
      // A remembered folder was deleted in Drive: forget them and retry once.
      if (error.status !== 404) throw error;
      folderIds.clear();
      file = await send();
    }
    return {
      storageProvider: 'gdrive',
      storageKey: file.id,
      storageBucket: rootId,
      storageRegion: null,
      storageProject: null
    };
  }

  async delete(locator) {
    if (!locator?.storageKey) return;
    try {
      const client = await connection.getClient();
      await client.deleteFile(locator.storageKey);
    } catch (_error) {
      // Same as the other providers: deleting is best effort.
    }
  }

  async exists(locator) {
    if (!locator?.storageKey) return false;
    try {
      const client = await connection.getClient();
      return Boolean(await client.getFile(locator.storageKey));
    } catch (_error) {
      return false;
    }
  }

  async getStream(locator) {
    if (!locator?.storageKey) return null;
    try {
      const client = await connection.getClient();
      return await client.download(locator.storageKey);
    } catch (_error) {
      return null;
    }
  }

  // Drive has no expiring links: files stream through the app instead.
  async getSignedUrl() {
    return null;
  }

  async testConnection() {
    try {
      const client = await connection.getClient();
      const folderId = await connection.ensureFolder('uploads', client);
      const file = await client.uploadFile({ name: `.storage-test-${Date.now()}.txt`, parentId: folderId, mimeType: 'text/plain', buffer: Buffer.from('test') });
      if (!(await client.getFile(file.id))) throw new Error('File was not written successfully');
      await client.deleteFile(file.id);
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, message: `Google Drive storage test failed: ${error.message}` };
    }
  }
}

module.exports = GoogleDriveStorageProvider;
