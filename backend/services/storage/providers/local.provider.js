const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

class LocalStorageProvider {
  constructor(config = {}) {
    this.uploadDir = config.uploadDir || path.join(__dirname, '../../../..', 'uploads');
  }

  async _resolvePath(storageKey) {
    if (!storageKey) throw new Error('Storage key is required');
    
    // storageKey might have leading slash, making resolve act weirdly
    const normalizedKey = storageKey.replace(/^\/+/, '');
    const absolutePath = path.resolve(this.uploadDir, normalizedKey);
    
    const rootPath = path.resolve(this.uploadDir);
    if (!absolutePath.startsWith(rootPath)) {
      throw new Error('Path traversal detected');
    }
    
    return absolutePath;
  }

  async upload(buffer, storageKey) {
    const absolutePath = await this._resolvePath(storageKey);
    await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
    await fsp.writeFile(absolutePath, buffer);
    return {
      storageProvider: 'local',
      storageKey: storageKey,
      storageBucket: 'local',
      storageRegion: 'local',
      storageProject: 'local'
    };
  }

  async delete(locator) {
    if (!locator || !locator.storageKey) return;
    try {
      const absolutePath = await this._resolvePath(locator.storageKey);
      if (fs.existsSync(absolutePath)) {
        await fsp.unlink(absolutePath);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  async exists(locator) {
    if (!locator || !locator.storageKey) return false;
    try {
      const absolutePath = await this._resolvePath(locator.storageKey);
      return fs.existsSync(absolutePath);
    } catch (e) {
      return false;
    }
  }

  async getStream(locator) {
    if (!locator || !locator.storageKey) return null;
    const absolutePath = await this._resolvePath(locator.storageKey);
    if (!fs.existsSync(absolutePath)) return null;
    return fs.createReadStream(absolutePath);
  }

  async getSignedUrl(locator, options) {
    // Local provider streams instead of redirecting
    return null;
  }

  async testConnection() {
    try {
      const testKey = `.storage-test/${Date.now()}.txt`;
      const absolutePath = await this._resolvePath(testKey);
      await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
      await fsp.writeFile(absolutePath, 'test');
      
      const exists = fs.existsSync(absolutePath);
      if (!exists) throw new Error('File was not written successfully');
      
      await fsp.unlink(absolutePath);
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, message: 'Local storage test failed: ' + error.message };
    }
  }
}

module.exports = LocalStorageProvider;
