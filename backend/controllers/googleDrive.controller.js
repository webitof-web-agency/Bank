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

// Manual backup: a fresh pg_dump downloaded straight to the user's computer
// (not uploaded to Drive). The temporary file is removed once sent.
async function downloadLocalBackupController(_req, res, next) {
  let dump;
  try {
    dump = await backups.createLocalDump();
  } catch (error) {
    console.error(`[backup] local backup failed: ${error.message}`);
    return next(error);
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${dump.name.replace(/"/g, '')}"`);
  res.setHeader('Content-Length', String(dump.size));
  const stream = require('fs').createReadStream(dump.file);
  res.on('close', dump.cleanup);
  stream.on('error', (error) => (res.headersSent ? res.destroy(error) : next(error)));
  return stream.pipe(res);
}

async function downloadBackupController(req, res, next) {
  try {
    const { name, size, stream } = await backups.openBackupDownload(req.params.fileId);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
    if (size) res.setHeader('Content-Length', String(size));
    stream.on('error', (error) => (res.headersSent ? res.destroy(error) : next(error)));
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  connectController,
  disconnectController,
  downloadBackupController,
  downloadLocalBackupController,
  listBackupsController,
  oauthCallbackController,
  statusController
};
