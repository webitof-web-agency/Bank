const Settings = require('../models/settings.model');
const StorageService = require('../services/storage/storage.service');
const encryption = require('../utils/encryption');

async function getSettings(req, res, next) {
  try {
    const settingsDoc = await Settings.findOne({ key: 'storage_settings' }).lean();
    const config = settingsDoc?.payload || {};

    const safeConfig = {
      configurationSource: config.configurationSource || 'environment',
      activeProvider: config.activeProvider || 'local',
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
      }
    };

    res.json({ success: true, data: safeConfig });
  } catch (error) {
    next(error);
  }
}

async function updateSettings(req, res, next) {
  try {
    const { configurationSource, activeProvider, local, gcs, s3 } = req.body;
    
    const settingsDoc = await Settings.findOne({ key: 'storage_settings' }).lean();
    const currentConfig = settingsDoc?.payload || {};

    const updatedConfig = {
      configurationSource: configurationSource || 'environment',
      activeProvider: activeProvider || 'local',
      local: local || { uploadDir: './uploads', prefix: 'images' },
      gcs: {
        projectId: gcs?.projectId || '',
        bucket: gcs?.bucket || '',
        prefix: gcs?.prefix || 'images',
        authMode: gcs?.authMode || 'ADC'
      },
      s3: {
        region: s3?.region || '',
        bucket: s3?.bucket || '',
        prefix: s3?.prefix || 'images',
        authMode: s3?.authMode || 'default',
        accessKeyId: s3?.accessKeyId || ''
      }
    };

    if (gcs?.authMode === 'service_account') {
      if (gcs.serviceAccountJson) {
        updatedConfig.gcs.encryptedCredentials = encryption.encrypt(gcs.serviceAccountJson);
      } else if (currentConfig.gcs?.encryptedCredentials) {
        updatedConfig.gcs.encryptedCredentials = currentConfig.gcs.encryptedCredentials;
      }
    }

    if (s3?.authMode === 'access_key') {
      if (s3.secretAccessKey) {
        updatedConfig.s3.encryptedSecret = encryption.encrypt(s3.secretAccessKey);
      } else if (currentConfig.s3?.encryptedSecret) {
        updatedConfig.s3.encryptedSecret = currentConfig.s3.encryptedSecret;
      }
      
      if (s3.sessionToken) {
        updatedConfig.s3.encryptedSessionToken = encryption.encrypt(s3.sessionToken);
      } else if (currentConfig.s3?.encryptedSessionToken) {
        updatedConfig.s3.encryptedSessionToken = currentConfig.s3.encryptedSessionToken;
      }
    }

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
