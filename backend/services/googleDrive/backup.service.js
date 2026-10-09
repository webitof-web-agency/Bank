// Database backups to Google Drive.
//
// pg_dump (custom format, compressed) of the app's database -> the "DB
// Backups" folder in the connected Drive -> keep the newest N (default 7),
// delete older ones. Runs daily at GDRIVE_BACKUP_HOUR_IST (default 2 AM India
// time) from the automation cycle. A manual backup is not sent to Drive: it
// is downloaded to the administrator's computer (createLocalDump).
//
// Only one backup runs at a time, across processes too (Postgres advisory
// lock). Only files this service names bank-backup-*.dump are ever deleted.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Settings = require('../../models/settings.model');
const JobState = require('../../models/jobState.model');
const { initializeDatabase, getDumpConnection } = require('../../config/postgres');
const { getGoogleDriveConfig } = require('../../config/googleDrive');
const connection = require('./driveConnection.service');

const STATUS_KEY = 'google_drive_backup';
const SCHEDULE_JOB_KEY = 'gdrive-db-backup';
const LOCK_NAME = 'gdrive-db-backup';
const FILE_RE = /^bank-backup-.+\.dump$/;
const IST_OFFSET_MS = 330 * 60 * 1000;

let running = null;

// ---------------------------------------------------------------------------
// pg_dump

function safeText(value, max = 300) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

// Runs pg_dump into `file`. The password goes in PGPASSWORD, never on the
// command line (visible in the process list) or in an error message.
function runPgDump({ file, conn, pgDumpPath }) {
  return new Promise((resolve, reject) => {
    const args = ['--format=custom', '--compress=6', '--no-owner', '--no-privileges',
      `--host=${conn.host}`, `--port=${conn.port}`, `--username=${conn.user}`, `--dbname=${conn.database}`, `--file=${file}`];
    const child = spawn(pgDumpPath, args, { env: { ...process.env, PGPASSWORD: conn.password || '' }, windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-2000); });
    child.on('error', (error) => reject(new Error(error.code === 'ENOENT'
      ? `pg_dump was not found ("${pgDumpPath}"). Install the PostgreSQL client tools or set PG_DUMP_PATH.`
      : `pg_dump could not start: ${safeText(error.message)}`)));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump failed (exit ${code}): ${safeText(stderr.split(conn.password || '\u0000').join('[redacted]'))}`));
    });
  });
}

let dumpRunner = runPgDump;

// Tests only.
function setDumpRunnerForTests(fn) {
  dumpRunner = fn || runPgDump;
}

// ---------------------------------------------------------------------------
// Status

async function readStatus() {
  const doc = await Settings.findOne({ key: STATUS_KEY }).lean();
  return doc?.payload && typeof doc.payload === 'object' ? doc.payload : {};
}

async function writeStatus(patch) {
  const next = { ...(await readStatus()), ...patch };
  await Settings.findOneAndUpdate({ key: STATUS_KEY }, { $set: { key: STATUS_KEY, payload: next } }, { upsert: true, new: true });
  return next;
}

function istParts(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`,
    hour: ist.getUTCHours(),
    stamp: `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}_${pad(ist.getUTCHours())}-${pad(ist.getUTCMinutes())}-${pad(ist.getUTCSeconds())}`
  };
}

async function getBackupStatus() {
  const config = getGoogleDriveConfig();
  const status = await readStatus();
  // A RUNNING state left by a process that stopped mid-backup expires.
  const startedAt = Date.parse(status.last?.startedAt || '') || 0;
  const recentlyStarted = status.state === 'RUNNING' && Date.now() - startedAt < 60 * 60 * 1000;
  return {
    running: Boolean(running) || recentlyStarted,
    keep: config.backupKeep,
    schedule: config.backupHourIst >= 0
      ? { enabled: true, hourIst: config.backupHourIst, label: `Daily at ${String(config.backupHourIst).padStart(2, '0')}:00 IST` }
      : { enabled: false, hourIst: null, label: 'Manual only' },
    last: status.last || null,
    lastSuccess: status.lastSuccess || null
  };
}

// ---------------------------------------------------------------------------
// Backup

function backupName(database, date = new Date()) {
  return `bank-backup-${String(database).replace(/[^A-Za-z0-9_-]/g, '_')}-${istParts(date).stamp}-IST.dump`;
}

// Deletes all but the newest `keep` backups (only our own files).
async function applyRetention(client, folderId, keep) {
  const files = (await client.listFiles(folderId)).filter((file) => FILE_RE.test(file.name || ''));
  files.sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime)));
  const removed = [];
  for (const file of files.slice(keep)) {
    await client.deleteFile(file.id);
    removed.push(file.name);
  }
  return removed;
}

async function withAdvisoryLock(fn) {
  const db = await initializeDatabase();
  const client = await db.connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [LOCK_NAME]);
    if (!rows[0]?.locked) return { skipped: true };
    try {
      return { result: await fn() };
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_NAME]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

async function performBackup({ trigger, userId }) {
  const config = getGoogleDriveConfig();
  const startedAt = new Date();
  await writeStatus({ state: 'RUNNING', last: { status: 'RUNNING', trigger, startedAt: startedAt.toISOString(), userId: userId || null } });
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bank-backup-'));
  const conn = getDumpConnection();
  const name = backupName(conn.database, startedAt);
  const file = path.join(tmpDir, name);
  try {
    const client = await connection.getClient();
    const folderId = await connection.ensureFolder('backup', client);
    await dumpRunner({ file, conn, pgDumpPath: config.pgDumpPath });
    const buffer = await fs.promises.readFile(file);
    if (!buffer.length) throw new Error('pg_dump produced an empty file.');
    const uploaded = await client.uploadFile({ name, parentId: folderId, mimeType: 'application/octet-stream', buffer });
    // The backup is safe in Drive at this point: a failed clean-up of old
    // ones is reported, not turned into a failed backup.
    let removed = [];
    let retentionError = '';
    try {
      removed = await applyRetention(client, folderId, config.backupKeep);
    } catch (error) {
      retentionError = safeText(error.message);
      console.error(`[backup] old backups could not be removed: ${retentionError}`);
    }
    const last = {
      status: 'SUCCESS', trigger, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), userId: userId || null,
      fileId: uploaded.id, fileName: name, size: buffer.length, removed: removed.length,
      ...(retentionError ? { retentionError } : {})
    };
    await writeStatus({ state: 'IDLE', last, lastSuccess: last });
    return last;
  } catch (error) {
    const last = {
      status: 'FAILED', trigger, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), userId: userId || null,
      error: safeText(error.message)
    };
    console.error(`[backup] Google Drive backup failed: ${last.error}`);
    await writeStatus({ state: 'IDLE', last });
    return last;
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Never throws: the result says what happened.
async function runBackup({ trigger = 'manual', userId = null } = {}) {
  if (running) return { status: 'ALREADY_RUNNING' };
  running = (async () => {
    const locked = await withAdvisoryLock(() => performBackup({ trigger, userId }));
    return locked.skipped ? { status: 'ALREADY_RUNNING' } : locked.result;
  })();
  try {
    return await running;
  } catch (error) {
    return { status: 'FAILED', error: safeText(error.message) };
  } finally {
    running = null;
  }
}

// Manual backup (Settings -> Backup & Restore -> Download Backup): a pg_dump
// in a temporary folder, streamed to the browser by the caller, which must
// call cleanup() once the download ends. Nothing goes to Google Drive.
async function createLocalDump() {
  const config = getGoogleDriveConfig();
  const conn = getDumpConnection();
  const name = backupName(conn.database);
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bank-backup-'));
  const cleanup = () => fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  const file = path.join(tmpDir, name);
  try {
    await dumpRunner({ file, conn, pgDumpPath: config.pgDumpPath });
    const { size } = await fs.promises.stat(file);
    if (!size) throw new Error('pg_dump produced an empty file.');
    return { file, name, size, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

// Called by the automation cycle (every 15 minutes): one backup per India
// date, at or after the configured hour, when Drive is connected.
async function runScheduledBackupIfDue(now = new Date()) {
  const config = getGoogleDriveConfig();
  if (config.backupHourIst < 0) return { skipped: 'schedule off' };
  const { date, hour } = istParts(now);
  if (hour < config.backupHourIst) return { skipped: 'not yet' };
  const state = await JobState.findOne({ key: SCHEDULE_JOB_KEY }).lean();
  if (state?.lastRunLabel === date) return { skipped: 'already ran today' };
  const status = await connection.getStatus();
  if (!status.connected || status.needsReconnect) return { skipped: 'not connected' };
  // Recorded before running: a failing backup is not retried every 15
  // minutes (the page shows the failure; "Back up now" retries).
  await JobState.findOneAndUpdate({ key: SCHEDULE_JOB_KEY }, { $set: { lastRunAt: new Date(), lastRunLabel: date } }, { upsert: true, new: true });
  return runBackup({ trigger: 'schedule' });
}

async function listBackups() {
  const state = await connection.readState();
  if (!state.encryptedRefreshToken || !state.backupFolderId) return [];
  const client = await connection.getClient();
  const files = (await client.listFiles(state.backupFolderId)).filter((file) => FILE_RE.test(file.name || ''));
  return files.map((file) => ({ id: file.id, name: file.name, size: Number(file.size || 0), createdTime: file.createdTime }));
}

// Only a file listed in the backup folder can be downloaded through this.
async function openBackupDownload(fileId) {
  const backup = (await listBackups()).find((file) => file.id === fileId);
  if (!backup) {
    const error = new Error('Backup not found.');
    error.statusCode = 404;
    throw error;
  }
  const client = await connection.getClient();
  return { name: backup.name, size: backup.size, stream: await client.download(backup.id) };
}

module.exports = {
  FILE_RE,
  applyRetention,
  backupName,
  getBackupStatus,
  istParts,
  listBackups,
  openBackupDownload,
  runBackup,
  runScheduledBackupIfDue,
  setDumpRunnerForTests,
  createLocalDump
};
