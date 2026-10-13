// A simple health and resource report: is everything connected, have there
// been server errors, how much memory / disk / cache the backend uses.
//
// Two views of the same data:
//   - public  (GET /): up/down states and numbers only. No error text, host,
//     database name or account, since anyone can open that address.
//   - detailed (GET /api/system/status, settings.read): adds the error
//     messages and the reason a check failed.
// Results are reused for CACHE_MS, so the page can't be used to load the
// database, and every check has a time limit so the page never hangs.
const fs = require('fs');
const os = require('os');
const v8 = require('v8');
const { getCacheStats, pingDatabase } = require('../config/postgres');
const { getErrorStats } = require('../utils/errorStats');

const CACHE_MS = 10 * 1000;
const CHECK_TIMEOUT_MS = 4000;
const MB = 1024 * 1024;

let cached = null;
let cachedAt = 0;
let inflight = null;

const toMb = (bytes) => (Number.isFinite(bytes) ? Math.round(bytes / MB) : null);
const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);

function withTimeout(promise, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} did not answer within ${CHECK_TIMEOUT_MS / 1000}s`)), CHECK_TIMEOUT_MS); })
  ]).finally(() => clearTimeout(timer));
}

// Runs one check; a failure becomes { status: 'error', error } instead of
// breaking the whole report.
async function check(label, fn) {
  try {
    return await withTimeout(Promise.resolve().then(fn), label);
  } catch (error) {
    return { status: 'error', error: String(error?.message || error).slice(0, 300) };
  }
}

function readNumberFile(file) {
  try {
    const text = fs.readFileSync(file, 'utf8').trim();
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  } catch (_error) {
    return null;
  }
}

// The container's memory limit and use (cgroup v2, then v1). Outside a
// container, or with no limit, the limit is null.
function containerMemory() {
  const limit = readNumberFile('/sys/fs/cgroup/memory.max') ?? readNumberFile('/sys/fs/cgroup/memory/memory.limit_in_bytes');
  const used = readNumberFile('/sys/fs/cgroup/memory.current') ?? readNumberFile('/sys/fs/cgroup/memory/memory.usage_in_bytes');
  const realLimit = limit && limit < os.totalmem() * 4 ? limit : null; // "max" / huge v1 values mean no limit
  return { usedMb: toMb(used), limitMb: toMb(realLimit), usedPercent: realLimit && used ? percent(used, realLimit) : null };
}

function memoryReport() {
  const usage = process.memoryUsage();
  const heapLimit = v8.getHeapStatistics().heap_size_limit;
  return {
    processMb: toMb(usage.rss),
    heapUsedMb: toMb(usage.heapUsed),
    heapLimitMb: toMb(heapLimit),
    heapUsedPercent: percent(usage.heapUsed, heapLimit),
    container: containerMemory(),
    serverTotalMb: toMb(os.totalmem()),
    serverFreeMb: toMb(os.freemem())
  };
}

// The disk the backend runs on (in Docker: the container's root, i.e. the
// server disk that holds Docker's data).
async function diskReport() {
  const stats = await fs.promises.statfs('/');
  const total = stats.blocks * stats.bsize;
  const free = stats.bavail * stats.bsize;
  return { totalGb: Math.round((total / 1024 / MB) * 10) / 10, freeGb: Math.round((free / 1024 / MB) * 10) / 10, usedPercent: percent(total - free, total) };
}

async function collect() {
  // Required lazily: these load the settings/Drive services, which need the
  // database layer to be set up first.
  const driveConnection = require('./googleDrive/driveConnection.service');
  const backups = require('./googleDrive/backup.service');
  const { resolveSmtpConfig } = require('./mailer.service');
  const { getSmsConfig, getSmsConfigProblems } = require('../config/sms');

  const [database, drive, backup, email, disk] = await Promise.all([
    check('Database', async () => {
      const ping = await pingDatabase();
      return { status: 'ok', latencyMs: ping.latencyMs, sizeMb: toMb(ping.sizeBytes) };
    }),
    check('Google Drive', async () => {
      const state = await driveConnection.getStatus();
      if (!state.connected) return { status: 'not_connected' };
      return state.needsReconnect ? { status: 'needs_reconnect', error: 'Google Drive must be connected again (Settings -> Storage Providers).' } : { status: 'ok' };
    }),
    check('Backups', async () => {
      const state = await backups.getBackupStatus();
      const last = state.last || null;
      return {
        status: !last ? 'none_yet' : last.status === 'SUCCESS' ? 'ok' : last.status === 'RUNNING' ? 'running' : 'error',
        lastAt: last?.finishedAt || last?.startedAt || null,
        lastSuccessAt: state.lastSuccess?.finishedAt || null,
        schedule: state.schedule?.label || null,
        ...(last && last.status === 'FAILED' ? { error: String(last.error || 'Backup failed').slice(0, 300) } : {})
      };
    }),
    check('Email', async () => ((await resolveSmtpConfig()) ? { status: 'ok' } : { status: 'not_configured' })),
    check('Disk', diskReport)
  ]);

  const smsConfig = getSmsConfig();
  const smsProblems = getSmsConfigProblems(smsConfig);
  const sms = !smsConfig.enabled ? { status: 'disabled' } : smsProblems.length ? { status: 'error', error: smsProblems.join('; ') } : { status: 'ok' };

  const memory = memoryReport();
  const errors = getErrorStats();
  const warnings = [];
  if (database.status !== 'ok') warnings.push('Database is not answering');
  if (drive.status === 'needs_reconnect' || drive.status === 'error') warnings.push('Google Drive connection has a problem');
  if (backup.status === 'error') warnings.push('The last backup failed');
  if (sms.status === 'error') warnings.push('SMS is enabled but not configured');
  if (memory.heapUsedPercent >= 85) warnings.push(`Memory is high (${memory.heapUsedPercent}% of the Node heap)`);
  if (memory.container.usedPercent >= 90) warnings.push(`Container memory is high (${memory.container.usedPercent}%)`);
  if (disk.usedPercent >= 90) warnings.push(`Disk is almost full (${disk.usedPercent}% used)`);
  if (errors.lastAt && Date.now() - Date.parse(errors.lastAt) < 15 * 60 * 1000) warnings.push('A server error happened in the last 15 minutes');

  return {
    status: database.status !== 'ok' ? 'down' : warnings.length ? 'degraded' : 'ok',
    checkedAt: new Date().toISOString(),
    uptime: { seconds: Math.round(process.uptime()), startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString() },
    warnings,
    checks: { database, googleDrive: drive, backups: backup, email, sms },
    resources: {
      memory,
      disk,
      cache: getCacheStats(),
      cpu: { loadAverage1m: Math.round(os.loadavg()[0] * 100) / 100, cores: os.cpus().length }
    },
    errors
  };
}

// The full report; reused for CACHE_MS, one collection at a time.
async function getSystemStatus() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  if (!inflight) {
    inflight = collect()
      .then((report) => { cached = report; cachedAt = Date.now(); return report; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

// Without error text: what the public address may show.
function toPublicStatus(report) {
  const checks = Object.fromEntries(Object.entries(report.checks).map(([name, value]) => {
    const { error, ...rest } = value || {};
    return [name, rest];
  }));
  const { recent, ...errors } = report.errors;
  return { ...report, checks, errors };
}

module.exports = { getSystemStatus, toPublicStatus };
