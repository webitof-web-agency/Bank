const Settings = require('../models/settings.model');
const StorageService = require('../services/storage/storage.service');
const encryption = require('../utils/encryption');
const driveConnection = require('../services/googleDrive/driveConnection.service');

async function driveStorageSummary() {
  const drive = await driveConnection.getStatus();
  return {
    connected: drive.connected && !drive.needsReconnect,
    accountEmail: drive.accountEmail,
    uploadsFolderLink: drive.uploadsFolder.link
  };
}

const SELECTABLE_PROVIDERS = ['local', 'gdrive'];

async function getSettings(req, res, next) {
  try {
    const settingsDoc = await Settings.findOne({ key: 'storage_settings' }).lean();
    const config = settingsDoc?.payload || {};

    const fromEnvironment = (config.configurationSource || 'environment') !== 'site_settings';
    const safeConfig = {
      configurationSource: config.configurationSource || 'environment',
      // What new uploads use right now (STORAGE_PROVIDER until a choice is saved).
      activeProvider: (fromEnvironment ? process.env.STORAGE_PROVIDER : config.activeProvider) || 'local',
      local: config.local || { uploadDir: './uploads', prefix: 'images' },
      gcs: {
        projectId: config.gcs?.projectId || '',
        bucket: config.gcs?.bucket || '',
        prefix: config.gcs?.prefix || 'images',
        authMode: config.gcs?.authMode || 'ADC',
        credentialsConfigured: !!config.gcs?.encryptedCredentials
      },
      s3: {
        region: config.s3?.region || '',
        bucket: config.s3?.bucket || '',
        prefix: config.s3?.prefix || 'images',
        authMode: config.s3?.authMode || 'default',
        accessKeyId: config.s3?.accessKeyId || '',
        secretConfigured: !!config.s3?.encryptedSecret
      },
      // Google Drive has no settings here: it uses the account connected on
      // Settings -> Google Drive.
      gdrive: await driveStorageSummary()
    };

    res.json({ success: true, data: safeConfig });
  } catch (error) {
    next(error);
  }
}

async function updateSettings(req, res, next) {
  try {
    // The page offers Local storage or Google Drive. Saving makes the choice
    // here the one used (site settings); GCS / S3 settings saved earlier are
    // kept as they are.
    const { activeProvider, local } = req.body || {};
    if (!SELECTABLE_PROVIDERS.includes(activeProvider)) {
      return res.status(400).json({ success: false, message: 'Choose Local Storage or Google Drive.' });
    }
    if (activeProvider === 'gdrive') {
      const drive = await driveConnection.getStatus();
      if (!drive.connected || drive.needsReconnect) {
        return res.status(400).json({ success: false, message: 'Connect Google Drive before choosing it for uploads.' });
      }
    }

    const settingsDoc = await Settings.findOne({ key: 'storage_settings' }).lean();
    const currentConfig = settingsDoc?.payload || {};

    const updatedConfig = {
      ...currentConfig,
      configurationSource: 'site_settings',
      activeProvider,
      local: {
        uploadDir: String(local?.uploadDir || currentConfig.local?.uploadDir || './uploads').trim(),
        prefix: String(local?.prefix ?? currentConfig.local?.prefix ?? 'images').trim()
      }
    };

    await Settings.findOneAndUpdate(
      { key: 'storage_settings' },
      { $set: { key: 'storage_settings', payload: updatedConfig } },
      { upsert: true, new: true }
    );
    
    await StorageService.reloadConfig();

    res.json({ success: true, message: 'Storage settings updated successfully' });
  } catch (error) {
    next(error);
  }
}

async function testConnection(req, res, next) {
  try {
    const { provider, config } = req.body;
    
    let candidateConfig = { ...config };
    
    const settingsDoc = await Settings.findOne({ key: 'storage_settings' }).lean();
    const currentConfig = settingsDoc?.payload || {};

    if (provider === 'gcs' && config.authMode === 'service_account') {
      if (config.serviceAccountJson) {
        candidateConfig.encryptedCredentials = encryption.encrypt(config.serviceAccountJson);
      } else if (currentConfig.gcs?.encryptedCredentials) {
        candidateConfig.encryptedCredentials = currentConfig.gcs.encryptedCredentials;
      }
    }

    if (provider === 's3' && config.authMode === 'access_key') {
      if (config.secretAccessKey) {
        candidateConfig.encryptedSecret = encryption.encrypt(config.secretAccessKey);
      } else if (currentConfig.s3?.encryptedSecret) {
        candidateConfig.encryptedSecret = currentConfig.s3.encryptedSecret;
      }
      if (config.sessionToken) {
        candidateConfig.encryptedSessionToken = encryption.encrypt(config.sessionToken);
      } else if (currentConfig.s3?.encryptedSessionToken) {
        candidateConfig.encryptedSessionToken = currentConfig.s3.encryptedSessionToken;
      }
    }

    const result = await StorageService.testConnection(provider, candidateConfig);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSettings,
  updateSettings,
  testConnection
};
