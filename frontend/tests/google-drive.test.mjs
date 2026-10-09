// Settings -> Google Drive: connection and backup sections, wording, and
// that no token or client secret can render. Rendered through Vite SSR.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let utils;
let sections;
let links;
let vite;

before(async () => {
  vite = await createServer({
    appType: 'custom', configFile: false, logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' },
    server: { hmr: false, middlewareMode: true }
  });
  utils = await vite.ssrLoadModule('/src/pages/settings/googleDrive/googleDriveUtils.js');
  sections = await vite.ssrLoadModule('/src/pages/settings/googleDrive/GoogleDriveSections.jsx');
  links = await vite.ssrLoadModule('/src/pages/settings/settingsLinks.js');
});

after(async () => {
  await vite?.close();
});

const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const CONNECTED = {
  configured: true, problems: [], connected: true, needsReconnect: false, accountEmail: 'society.backup@gmail.com',
  redirectUri: 'http://localhost:8001/api/google-drive/oauth/callback',
  backupFolder: { id: 'f1', name: 'Banking Raipur – DB Backups', link: 'https://drive.google.com/drive/folders/f1' },
  uploadsFolder: { id: 'f2', name: 'Banking Raipur – Uploads', link: 'https://drive.google.com/drive/folders/f2' }
};
const BACKUP = { running: false, keep: 7, schedule: { enabled: true, hourIst: 2, label: 'Daily at 02:00 IST' }, last: null };

test('Google Drive is linked under Settings at /app/settings/google-drive', async () => {
  const link = links.SETTINGS_LINKS.find((item) => item.path === '/app/settings/google-drive');
  assert.equal(link.permission, 'settings.read');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /path="settings\/google-drive" element=\{<PermissionRoute permission="settings\.read"><GoogleDrivePage \/>/);
});

test('connection: not configured shows what is missing and the redirect URI; connect disabled', () => {
  const drive = { ...CONNECTED, configured: false, connected: false, accountEmail: '', problems: ['GOOGLE_OAUTH_CLIENT_ID is not set.'], backupFolder: {}, uploadsFolder: {} };
  const html = render(sections.DriveConnectionCard, { drive, canWrite: true });
  assert.match(text(html), /Not configured/);
  assert.match(text(html), /GOOGLE_OAUTH_CLIENT_ID is not set/);
  assert.match(text(html), /google-drive\/oauth\/callback/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>.*Connect Google Drive/);
});

test('connection: connected shows the account and both folders; disconnect blocked while Drive stores uploads', () => {
  const html = render(sections.DriveConnectionCard, { drive: CONNECTED, canWrite: true, usedForUploads: true });
  const plain = text(html);
  assert.match(plain, /Connected/);
  assert.match(plain, /Signed in as society\.backup@gmail\.com/);
  assert.match(html, /href="https:\/\/drive\.google\.com\/drive\/folders\/f1"/);
  assert.match(plain, /Banking Raipur – Uploads/);
  assert.match(plain, /new images and files are stored in Google Drive/);
  assert.match(html, /<button[^>]*disabled=""[^>]*title="Switch uploads to another storage provider first"/);
  assert.doesNotMatch(plain, /Connect Google Drive/);
});

test('connection: reconnect needed; read-only users get no buttons', () => {
  const plain = text(render(sections.DriveConnectionCard, { drive: { ...CONNECTED, needsReconnect: true }, canWrite: true }));
  assert.match(plain, /Reconnect needed/);
  assert.match(plain, /Reconnect Google Drive/);
  const readOnly = render(sections.DriveConnectionCard, { drive: CONNECTED, canWrite: false });
  assert.equal(/<button/.test(readOnly), false);
});

test('backups: schedule, keep count, last result, list with size and download', () => {
  const backup = { ...BACKUP, last: { status: 'SUCCESS', trigger: 'schedule', startedAt: '2026-10-08T20:30:00Z', finishedAt: '2026-10-08T20:30:40Z', size: 5242880, removed: 1 } };
  const backups = [{ id: 'b1', name: 'bank-backup-postgres-2026-10-09_02-00-00-IST.dump', size: 5242880, createdTime: '2026-10-08T20:30:40Z' }];
  const html = render(sections.DriveBackupsCard, { backup, backups, connected: true, canWrite: true });
  const plain = text(html);
  assert.match(plain, /Daily at 02:00 IST · the newest 7 are kept/);
  assert.match(plain, /Last backup succeeded/);
  assert.match(plain, /09 Oct 2026.*IST \(scheduled\), 5\.0 MB, 1 older removed/);
  assert.match(plain, /bank-backup-postgres-2026-10-09_02-00-00-IST\.dump/);
  // Manual backups are downloaded on Backup & Restore, not sent to Drive.
  assert.equal(/Back up now/.test(plain), false);
  assert.match(plain, /Backup (&|&amp;) Restore/);
  assert.match(plain, /Download/);
});

test('backups: running and failed states; not connected shows no list', () => {
  assert.match(text(render(sections.DriveBackupsCard, { backup: { ...BACKUP, running: true }, connected: true, canWrite: true })), /Backing up…/);
  const failed = text(render(sections.DriveBackupsCard, { backup: { ...BACKUP, last: { status: 'FAILED', trigger: 'manual', startedAt: '2026-10-08T05:00:00Z', error: 'pg_dump was not found ("pg_dump").' } }, connected: true, canWrite: true }));
  assert.match(failed, /Last backup failed/);
  assert.match(failed, /pg_dump was not found/);
  const html = render(sections.DriveBackupsCard, { backup: BACKUP, connected: false, canWrite: true });
  assert.match(text(html), /Connect Google Drive to see backups/);
});

test('utils: sizes, IST time, the return from Google, safe file names', () => {
  assert.equal(utils.formatBytes(0), '—');
  assert.equal(utils.formatBytes(512), '512 B');
  assert.equal(utils.formatBytes(1536), '1.5 KB');
  assert.equal(utils.formatBytes(25 * 1024 * 1024), '25.0 MB');
  assert.match(utils.formatIstDateTime('2026-10-08T20:30:00Z'), /09 Oct 2026, 02:00 am IST/i);
  assert.deepEqual(utils.readConnectResult('?gdrive=connected'), { tone: 'success', message: 'Google Drive connected.' });
  assert.deepEqual(utils.readConnectResult('?gdrive=error&message=Access%20denied'), { tone: 'error', message: 'Access denied' });
  assert.equal(utils.readConnectResult(''), null);
  assert.equal(utils.backupFileName('../evil name.dump'), '.._evil_name.dump');
});

test('no token or client secret can render, even if the status carried one', () => {
  const leaky = { ...CONNECTED, encryptedRefreshToken: 'enc-refresh-123', refreshToken: 'refresh-secret-456', clientSecret: 'client-secret-789', accessToken: 'access-000' };
  const html = render(sections.DriveConnectionCard, { drive: leaky, canWrite: true })
    + render(sections.DriveBackupsCard, { backup: { ...BACKUP, token: 'refresh-secret-456' }, connected: true, canWrite: true });
  for (const secret of ['enc-refresh-123', 'refresh-secret-456', 'client-secret-789', 'access-000']) assert.equal(html.includes(secret), false, secret);
});
