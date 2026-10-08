const Settings = require('../models/settings.model');
const driveConnection = require('../services/googleDrive/driveConnection.service');
const backups = require('../services/googleDrive/backup.service');
const { getGoogleDriveConfig } = require('../config/googleDrive');

// Whether uploads currently go to Google Drive.
async function activeStorageProvider() {
  const doc = await Settings.findOne({ key: 'storage_settings' }).lean();
  const config = doc?.payload || {};
  if (config.configurationSource === 'site_settings' && config.activeProvider) return config.activeProvider;
  return String(process.env.STORAGE_PROVIDER || 'local').trim() || 'local';
}

async function statusController(_req, res, next) {
  try {
    const [drive, backup, provider] = await Promise.all([driveConnection.getStatus(), backups.getBackupStatus(), activeStorageProvider()]);
    res.json({ success: true, data: { drive, backup, storage: { activeProvider: provider, usedForUploads: provider === 'gdrive' } } });
  } catch (error) {
    next(error);
  }
}

async function connectController(req, res, next) {
  try {
    res.json({ success: true, data: { url: driveConnection.createAuthUrl(req.user || {}) } });
  } catch (error) {
    next(error);
  }
}

// Google redirects the browser here (no app login on this request); the
// signed state proves an administrator started it. Always ends by sending
// the browser back to the settings page with the outcome.
async function oauthCallbackController(req, res) {
  const target = new URL(getGoogleDriveConfig().returnUrl);
  try {
    await driveConnection.completeConnection({ code: req.query.code, state: req.query.state, error: req.query.error });
    target.searchParams.set('gdrive', 'connected');
  } catch (error) {
    console.error(`[gdrive] connect failed: ${error.message}`);
    target.searchParams.set('gdrive', 'error');
    target.searchParams.set('message', String(error.message || 'Google Drive could not be connected.').slice(0, 300));
  }
  res.redirect(302, target.toString());
}

async function disconnectController(_req, res, next) {
  try {
    res.json({ success: true, data: await driveConnection.disconnect({ activeStorageProvider: await activeStorageProvider() }) });
  } catch (error) {
    next(error);
  }
}

async function listBackupsController(_req, res, next) {
  try {
    res.json({ success: true, data: await backups.listBackups() });
  } catch (error) {
    next(error);
  }
}

async function startBackupController(req, res, next) {
  try {
    const result = await backups.startManualBackup({ userId: req.user?.id || null });
    res.status(result.started ? 202 : 409).json({ success: result.started, message: result.started ? 'Backup started' : result.reason, data: result });
  } catch (error) {
    next(error);
  }
}

async function downloadBackupController(req, res, next) {
  try {
    const { name, size, stream } = await backups.openBackupDownload(req.params.fileId);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
    if (size) res.setHeader('Content-Length', String(size));
    stream.on('error', (error) => next(error));
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  connectController,
  disconnectController,
  downloadBackupController,
  listBackupsController,
  oauthCallbackController,
  startBackupController,
  statusController
};
