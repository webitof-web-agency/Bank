// Uploaded files (member photos, documents) in the connected Google Drive's
// "Uploads" folder. The file record keeps the Drive file id as storageKey
// and the folder id as storageBucket; files are served through the app
// (/api/files/:id/view), never by a public Drive link.
const connection = require('../../googleDrive/driveConnection.service');

class GoogleDriveStorageProvider {
  // Drive name from the app's storage key: images/members/<id>/<stored>.jpg
  // -> images__members__<id>__<stored>.jpg (flat folder, still traceable).
  _driveName(storageKey) {
    if (!storageKey) throw new Error('Storage key is required');
    return String(storageKey).replace(/^\/+/, '').split('/').filter(Boolean).join('__');
  }

  async upload(buffer, storageKey, { mimeType } = {}) {
    const client = await connection.getClient();
    const folderId = await connection.ensureFolder('uploads', client);
    const file = await client.uploadFile({ name: this._driveName(storageKey), parentId: folderId, mimeType: mimeType || 'application/octet-stream', buffer });
    return {
      storageProvider: 'gdrive',
      storageKey: file.id,
      storageBucket: folderId,
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
