// The status page: the public view carries no error text, and the HTML page
// escapes everything it shows.
const test = require('node:test');
const assert = require('node:assert/strict');
const { toPublicStatus } = require('../services/systemStatus.service');
const { renderStatusPage } = require('../utils/statusPage');
const { getErrorStats, recordServerError } = require('../utils/errorStats');

function sampleReport() {
  return {
    status: 'degraded',
    checkedAt: '2026-10-13T07:00:00.000Z',
    uptime: { seconds: 3725, startedAt: '2026-10-13T06:00:00.000Z' },
    warnings: ['The last backup failed'],
    checks: {
      database: { status: 'ok', latencyMs: 4, sizeMb: 120 },
      googleDrive: { status: 'error', error: 'connect ECONNREFUSED 10.0.0.5:5432 user=jilabank_prod_user' },
      backups: { status: 'error', error: '<script>alert(1)</script> pg_dump failed', lastAt: null, lastSuccessAt: null },
      email: { status: 'not_configured' },
      sms: { status: 'disabled' }
    },
    resources: {
      memory: { processMb: 190, heapUsedMb: 80, heapLimitMb: 384, heapUsedPercent: 21, container: { usedMb: 300, limitMb: 768, usedPercent: 39 }, serverTotalMb: 8000, serverFreeMb: 2000 },
      disk: { totalGb: 290, freeGb: 245, usedPercent: 16 },
      cache: { tables: 31, rows: 17000 },
      cpu: { loadAverage1m: 0.5, cores: 4 }
    },
    errors: { since: '2026-10-13T06:00:00.000Z', count: 1, lastAt: '2026-10-13T06:59:00.000Z', recent: [{ at: '2026-10-13T06:59:00.000Z', route: 'GET /api/x', message: 'relation "users" does not exist' }] }
  };
}

test('public status: no error messages, hosts or recent errors', () => {
  const report = sampleReport();
  const text = JSON.stringify(toPublicStatus(report));
  assert.doesNotMatch(text, /ECONNREFUSED|jilabank_prod_user|relation "users"|pg_dump failed/);
  assert.equal(toPublicStatus(report).checks.googleDrive.status, 'error');
  assert.equal(toPublicStatus(report).errors.count, 1);
  // The full report is left untouched for the admin view.
  assert.equal(report.errors.recent.length, 1);
  assert.match(report.checks.backups.error, /pg_dump/);
});

test('status page: values are escaped, statuses labelled', () => {
  const html = renderStatusPage(sampleReport());
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Needs attention/);
  assert.match(html, /300 MB of 768 MB \(39%\)/);
  assert.match(html, /up 1h 2m/);
  // Reloads itself, without any script.
  assert.match(html, /<meta http-equiv="refresh" content="30">/);
  assert.doesNotMatch(html, /<script/);
});

test('server errors are counted, newest first, at most 10 kept', () => {
  const before = getErrorStats().count;
  for (let i = 0; i < 12; i += 1) recordServerError(new Error(`boom ${i}`), { method: 'GET', baseUrl: '/api', path: '/x' });
  const stats = getErrorStats();
  assert.equal(stats.count, before + 12);
  assert.equal(stats.recent.length, 10);
  assert.equal(stats.recent[0].message, 'boom 11');
  assert.equal(stats.recent[0].route, 'GET /api/x');
});
