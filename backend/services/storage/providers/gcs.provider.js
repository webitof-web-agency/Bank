const { Storage } = require('@google-cloud/storage');
const crypto = require('crypto');
const encryption = require('../../../utils/encryption');

class GoogleCloudStorageProvider {
  constructor(config = {}) {
    this.bucketName = config.bucket;
    this.projectId = config.projectId;
    this.prefix = config.prefix || '';
    this.authMode = config.authMode || 'ADC'; // ADC or service_account

    let storageOptions = {};
    if (this.projectId) {
      storageOptions.projectId = this.projectId;
    }

    if (this.authMode === 'service_account' && config.encryptedCredentials) {
      try {
        const credentialsJson = encryption.decrypt(config.encryptedCredentials);
        const credentials = JSON.parse(credentialsJson);
        storageOptions.credentials = credentials;
      } catch (e) {
        throw new Error('Failed to parse GCS service account credentials');
      }
    }

    this.storage = new Storage(storageOptions);
  }

  _getFullKey(storageKey) {
    if (!storageKey) throw new Error('Storage key is required');
    const cleanKey = storageKey.replace(/^\/+/, '');
    const cleanPrefix = this.prefix.replace(/^\/+/, '').replace(/\/+$/, '');
    return cleanPrefix ? `${cleanPrefix}/${cleanKey}` : cleanKey;
  }

  async upload(buffer, storageKey) {
    const fullKey = this._getFullKey(storageKey);
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(fullKey);

    await file.save(buffer, {
      resumable: false,
    });

    return {
      storageProvider: 'gcs',
      storageKey: fullKey,
      storageBucket: this.bucketName,
      storageRegion: null,
      storageProject: this.projectId
    };
  }

  async delete(locator) {
    if (!locator || !locator.storageKey || !locator.storageBucket) return;
    try {
      const bucket = this.storage.bucket(locator.storageBucket);
      const file = bucket.file(locator.storageKey);
      await file.delete({ ignoreNotFound: true });
    } catch (e) {
      // Ignore
    }
  }

  async exists(locator) {
    if (!locator || !locator.storageKey || !locator.storageBucket) return false;
    try {
      const bucket = this.storage.bucket(locator.storageBucket);
      const file = bucket.file(locator.storageKey);
      const [exists] = await file.exists();
      return exists;
    } catch (e) {
      return false;
    }
  }

  async getStream(locator) {
    if (!locator || !locator.storageKey || !locator.storageBucket) return null;
    try {
      const bucket = this.storage.bucket(locator.storageBucket);
      const file = bucket.file(locator.storageKey);
      const [exists] = await file.exists();
      if (!exists) return null;
      return file.createReadStream();
    } catch (e) {
      return null;
    }
  }

  async getSignedUrl(locator, options = {}) {
    if (!locator || !locator.storageKey || !locator.storageBucket) return null;
    try {
      const bucket = this.storage.bucket(locator.storageBucket);
      const file = bucket.file(locator.storageKey);
      
      const [exists] = await file.exists();
      if (!exists) return null;
      
      const config = {
        version: 'v4',
        action: 'read',
        expires: Date.now() + (options.expiresInMs || 15 * 60 * 1000) // 15 mins default
      };
      const [url] = await file.getSignedUrl(config);
      return url;
    } catch (e) {
      return null;
    }
  }

  async testConnection() {
    try {
      if (!this.bucketName) throw new Error('Bucket name is required');
      const testKey = this._getFullKey(`.storage-test/${Date.now()}-${crypto.randomUUID()}.txt`);
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(testKey);
      
      await file.save('test', { resumable: false });
      
      const [exists] = await file.exists();
      if (!exists) throw new Error('File was not written successfully');
      
      await file.delete({ ignoreNotFound: true });
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, message: 'GCS storage test failed: ' + error.message };
    }
  }
}

module.exports = GoogleCloudStorageProvider;
