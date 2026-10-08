// Google Drive (OAuth, Gmail account) for database backups and file uploads.
// Read from the environment on every call; backend-only, never sent to the
// browser. The refresh token itself is not here: it is obtained by
// "Connect Google Drive" and stored encrypted in the settings table.

function cleanText(value) {
  return String(value ?? '').trim();
}

function getGoogleDriveConfig() {
  const port = cleanText(process.env.PORT) || '8001';
  const apiPrefix = cleanText(process.env.API_PREFIX) || '/api';
  const firstFrontend = cleanText(process.env.FRONTEND_URL).split(',')[0].trim();
  const keep = Number(process.env.GDRIVE_BACKUP_KEEP || 7);
  const hour = Number(process.env.GDRIVE_BACKUP_HOUR_IST ?? 2);
  return {
    clientId: cleanText(process.env.GOOGLE_OAUTH_CLIENT_ID),
    clientSecret: cleanText(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    // Must be listed exactly under "Authorized redirect URIs" of the OAuth client.
    redirectUri: cleanText(process.env.GOOGLE_OAUTH_REDIRECT_URI) || `http://localhost:${port}${apiPrefix}/google-drive/oauth/callback`,
    // Where the browser lands after Google sends it back.
    returnUrl: (firstFrontend || 'http://localhost:5173').replace(/\/+$/, '') + '/app/settings/google-drive',
    backupFolderName: cleanText(process.env.GDRIVE_BACKUP_FOLDER_NAME) || 'Banking Raipur – DB Backups',
    uploadsFolderName: cleanText(process.env.GDRIVE_UPLOADS_FOLDER_NAME) || 'Banking Raipur – Uploads',
    backupKeep: Number.isInteger(keep) && keep > 0 ? Math.min(keep, 100) : 7,
    // Daily backup at this hour, India time (0-23); -1 turns the schedule off.
    backupHourIst: Number.isInteger(hour) && hour >= -1 && hour <= 23 ? hour : 2,
    pgDumpPath: cleanText(process.env.PG_DUMP_PATH) || 'pg_dump',
    timeoutMs: 60000
  };
}

// What is missing to connect, by name only.
function getGoogleDriveConfigProblems(config = getGoogleDriveConfig()) {
  const problems = [];
  if (!config.clientId) problems.push('GOOGLE_OAUTH_CLIENT_ID is not set.');
  if (!config.clientSecret) problems.push('GOOGLE_OAUTH_CLIENT_SECRET is not set.');
  if (!cleanText(process.env.SETTINGS_ENCRYPTION_KEY)) problems.push('SETTINGS_ENCRYPTION_KEY is not set (needed to store the Google token encrypted).');
  return problems;
}

module.exports = {
  getGoogleDriveConfig,
  getGoogleDriveConfigProblems
};
