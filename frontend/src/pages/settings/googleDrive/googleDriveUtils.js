// Settings -> Google Drive: formatting and status wording. Pure functions.
// The page only ever receives yes/no flags, the account email and folder
// links from the backend; never a token or the OAuth client secret.

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

// India time, the way the rest of the app shows dates.
export function formatIstDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
  }).format(date) + ' IST';
}

// Connection state in one word plus what to do next.
export function describeConnection(drive) {
  if (!drive) return { tone: 'muted', label: 'Loading', detail: '' };
  if (!drive.configured) return { tone: 'warning', label: 'Not configured', detail: (drive.problems || []).join(' ') };
  if (drive.connected && drive.needsReconnect) {
    return { tone: 'error', label: 'Reconnect needed', detail: 'Google no longer accepts the saved sign-in (access was removed or expired). Connect again.' };
  }
  if (drive.connected) return { tone: 'success', label: 'Connected', detail: drive.accountEmail ? `Signed in as ${drive.accountEmail}` : '' };
  return { tone: 'muted', label: 'Not connected', detail: 'Connect a Google account to start backups.' };
}

export function describeLastBackup(last) {
  if (!last) return { tone: 'muted', label: 'No backup yet', detail: '' };
  const when = formatIstDateTime(last.finishedAt || last.startedAt);
  const how = last.trigger === 'schedule' ? 'scheduled' : 'manual';
  if (last.status === 'RUNNING') return { tone: 'info', label: 'Backing up…', detail: `Started ${formatIstDateTime(last.startedAt)}` };
  if (last.status === 'SUCCESS') {
    const removed = last.removed ? `, ${last.removed} older removed` : '';
    return { tone: 'success', label: 'Last backup succeeded', detail: `${when} (${how}), ${formatBytes(last.size)}${removed}` };
  }
  return { tone: 'error', label: 'Last backup failed', detail: `${when} (${how}): ${last.error || 'unknown error'}` };
}

// ?gdrive=connected|error&message=... set by the backend after Google.
export function readConnectResult(search = '') {
  const params = new URLSearchParams(search);
  const result = params.get('gdrive');
  if (result === 'connected') return { tone: 'success', message: 'Google Drive connected.' };
  if (result === 'error') return { tone: 'error', message: params.get('message') || 'Google Drive could not be connected.' };
  return null;
}

export function backupFileName(name) {
  return String(name || 'backup.dump').replace(/[^A-Za-z0-9._-]/g, '_');
}
