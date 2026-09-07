const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const encryption = require('../../../utils/encryption');

class S3StorageProvider {
  constructor(config = {}) {
    this.region = config.region;
    this.bucketName = config.bucket;
    this.prefix = config.prefix || '';
    this.authMode = config.authMode || 'default'; // default or access_key

    const s3Config = {};
    if (this.region) {
      s3Config.region = this.region;
    }

    if (this.authMode === 'access_key' && config.accessKeyId && config.encryptedSecret) {
      const secretAccessKey = encryption.decrypt(config.encryptedSecret);
      s3Config.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: secretAccessKey
      };
      if (config.encryptedSessionToken) {
        s3Config.credentials.sessionToken = encryption.decrypt(config.encryptedSessionToken);
      }
    }

    this.client = new S3Client(s3Config);
  }

  _getFullKey(storageKey) {
    if (!storageKey) throw new Error('Storage key is required');
    const cleanKey = storageKey.replace(/^\/+/, '');
    const cleanPrefix = this.prefix.replace(/^\/+/, '').replace(/\/+$/, '');
    return cleanPrefix ? `${cleanPrefix}/${cleanKey}` : cleanKey;
  }

  async upload(buffer, storageKey) {
    const fullKey = this._getFullKey(storageKey);
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fullKey,
      Body: buffer,
    });

    await this.client.send(command);

    return {
      storageProvider: 's3',
      storageKey: fullKey,
      storageBucket: this.bucketName,
      storageRegion: this.region || null,
      storageProject: null
    };
  }

  async delete(locator) {
    if (!locator || !locator.storageKey || !locator.storageBucket) return;
    try {
      const command = new DeleteObjectCommand({
        Bucket: locator.storageBucket,
        Key: locator.storageKey
      });
      await this.client.send(command);
    } catch (e) {
      // Ignore
    }
  }

  async exists(locator) {
    if (!locator || !locator.storageKey || !locator.storageBucket) return false;
    try {
      const command = new HeadObjectCommand({
        Bucket: locator.storageBucket,
        Key: locator.storageKey
      });
      await this.client.send(command);
      return true;
    } catch (e) {
      return false;
    }
  }

  async getStream(locator) {
    if (!locator || !locator.storageKey || !locator.storageBucket) return null;
    try {
      const command = new GetObjectCommand({
        Bucket: locator.storageBucket,
        Key: locator.storageKey
      });
      const response = await this.client.send(command);
      return response.Body;
    } catch (e) {
      return null;
    }
  }

  async getSignedUrl(locator, options = {}) {
    if (!locator || !locator.storageKey || !locator.storageBucket) return null;
    try {
      const command = new GetObjectCommand({
        Bucket: locator.storageBucket,
        Key: locator.storageKey
      });
      
      const expiresIn = Math.floor((options.expiresInMs || 15 * 60 * 1000) / 1000);
      const url = await getSignedUrl(this.client, command, { expiresIn });
      return url;
    } catch (e) {
      return null;
    }
  }

  async testConnection() {
    try {
      if (!this.bucketName) throw new Error('Bucket name is required');
      const testKey = this._getFullKey(`.storage-test/${Date.now()}-${crypto.randomUUID()}.txt`);
      
      const putCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: testKey,
        Body: Buffer.from('test')
      });
      await this.client.send(putCommand);
      
      const headCommand = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: testKey
      });
      await this.client.send(headCommand); // Throws if not exists
      
      const delCommand = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: testKey
      });
      await this.client.send(delCommand);
      
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, message: 'S3 storage test failed: ' + error.message };
    }
  }
}

module.exports = S3StorageProvider;
