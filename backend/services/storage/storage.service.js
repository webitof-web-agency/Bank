const LocalStorageProvider = require('./providers/local.provider');
const GoogleCloudStorageProvider = require('./providers/gcs.provider');
const S3StorageProvider = require('./providers/s3.provider');
const Settings = require('../../models/settings.model');

class StorageService {
  constructor() {
    this.providerInstance = null;
  }

  async _loadConfig() {
    const settingsDoc = await Settings.findOne({ key: 'storage_settings' }).lean();
    let config = settingsDoc?.payload || {};

    if (config.configurationSource === 'site_settings' && config.activeProvider) {
      return {
        provider: config.activeProvider,
        config: config[config.activeProvider] || {}
      };
    }

    const envProvider = process.env.STORAGE_PROVIDER;
    if (envProvider) {
      if (envProvider === 's3') {
        return {
          provider: 's3',
          config: {
            region: process.env.AWS_REGION,
            bucket: process.env.S3_BUCKET,
            prefix: process.env.S3_PREFIX,
            authMode: 'default'
          }
        };
      } else if (envProvider === 'gcs') {
        return {
          provider: 'gcs',
          config: {
            projectId: process.env.GCS_PROJECT_ID,
            bucket: process.env.GCS_BUCKET,
            prefix: process.env.GCS_PREFIX,
            authMode: 'ADC'
          }
        };
      }
    }

    return {
      provider: 'local',
      config: {
        uploadDir: process.env.LOCAL_UPLOAD_DIR,
        prefix: process.env.LOCAL_STORAGE_PREFIX || 'images'
      }
    };
  }

  async _getProviderInstance() {
    if (this.providerInstance) return this.providerInstance;

    const { provider, config } = await this._loadConfig();
    this.providerInstance = this._createProviderInstance(provider, config);
    return this.providerInstance;
  }

  _createProviderInstance(providerName, config) {
    switch (providerName) {
      case 'gcs':
        return new GoogleCloudStorageProvider(config);
      case 's3':
        return new S3StorageProvider(config);
      case 'local':
      default:
        return new LocalStorageProvider(config);
    }
  }

  async reloadConfig() {
    this.providerInstance = null;
    await this._getProviderInstance();
  }

  async upload(buffer, storageKey) {
    const provider = await this._getProviderInstance();
    return provider.upload(buffer, storageKey);
  }

  async _getHistoricalProviderWithAuth(locator) {
    if (!locator || !locator.storageProvider || locator.storageProvider === 'local') {
      return new LocalStorageProvider({
        uploadDir: process.env.LOCAL_UPLOAD_DIR
      });
    }

    const settingsDoc = await Settings.findOne({ key: 'storage_settings' }).lean();
    let siteConfig = settingsDoc?.payload?.[locator.storageProvider] || {};
    
    let mergedConfig = {
      bucket: locator.storageBucket,
      region: locator.storageRegion,
      projectId: locator.storageProject
    };
    
    if (settingsDoc?.payload?.configurationSource === 'site_settings') {
       mergedConfig = { ...siteConfig, ...mergedConfig };
    } else {
       if (locator.storageProvider === 's3') {
           mergedConfig.authMode = 'default';
       } else if (locator.storageProvider === 'gcs') {
           mergedConfig.authMode = 'ADC';
       }
    }

    return this._createProviderInstance(locator.storageProvider, mergedConfig);
  }

  async delete(locator) {
    const provider = await this._getHistoricalProviderWithAuth(locator);
    return provider.delete(locator);
  }

  async exists(locator) {
    const provider = await this._getHistoricalProviderWithAuth(locator);
    return provider.exists(locator);
  }

  async getStream(locator) {
    const provider = await this._getHistoricalProviderWithAuth(locator);
    return provider.getStream(locator);
  }

  async getSignedUrl(locator, options) {
    const provider = await this._getHistoricalProviderWithAuth(locator);
    return provider.getSignedUrl(locator, options);
  }

  async testConnection(providerName, candidateConfig) {
    const provider = this._createProviderInstance(providerName, candidateConfig);
    return provider.testConnection();
  }
}

module.exports = new StorageService();
