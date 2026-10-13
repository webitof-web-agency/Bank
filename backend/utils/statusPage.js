// The status report as a small self-contained HTML page (no scripts, no
// external files), for opening the backend address in a browser.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

const COLORS = { ok: '#047857', running: '#1d4ed8', degraded: '#b45309', down: '#b91c1c', error: '#b91c1c', needs_reconnect: '#b45309' };
const LABELS = {
  ok: 'OK', down: 'Down', degraded: 'Needs attention', error: 'Error', running: 'Running',
  not_connected: 'Not connected', needs_reconnect: 'Reconnect needed', not_configured: 'Not configured',
  disabled: 'Turned off', none_yet: 'None yet'
};

function badge(status) {
  const color = COLORS[status] || '#475569';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;color:${color};border:1px solid ${color}33;background:${color}12">${escapeHtml(LABELS[status] || status)}</span>`;
}

function duration(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}

const row = (label, value) => `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`;
const mb = (value) => (value == null ? '—' : `${value} MB`);
const time = (iso) => (iso ? escapeHtml(new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })) + ' IST' : '—');

function renderStatusPage(report) {
  const { checks, resources: { memory, disk, cache, cpu }, errors } = report;
  const checkRows = [
    ['Database', checks.database, checks.database.latencyMs != null ? `${checks.database.latencyMs} ms · ${mb(checks.database.sizeMb)}` : ''],
    ['Google Drive', checks.googleDrive, ''],
    ['Backups', checks.backups, checks.backups.lastSuccessAt ? `last success ${time(checks.backups.lastSuccessAt)}` : escapeHtml(checks.backups.schedule || '')],
    ['Email (SMTP)', checks.email, ''],
    ['SMS', checks.sms, '']
  ].map(([label, value, note]) => row(label, `${badge(value.status)} <span class="muted">${note}</span>${value.error ? `<div class="err">${escapeHtml(value.error)}</div>` : ''}`)).join('');

  const container = memory.container.limitMb ? `${mb(memory.container.usedMb)} of ${mb(memory.container.limitMb)} (${memory.container.usedPercent}%)` : mb(memory.container.usedMb);
  const resourceRows = [
    row('Backend memory', `${mb(memory.processMb)}`),
    row('Node heap', `${mb(memory.heapUsedMb)} of ${mb(memory.heapLimitMb)} (${memory.heapUsedPercent}%)`),
    row('Container memory', container),
    row('Server memory', `${mb(memory.serverFreeMb)} free of ${mb(memory.serverTotalMb)}`),
    row('Disk', `${disk.freeGb ?? '—'} GB free of ${disk.totalGb ?? '—'} GB (${disk.usedPercent ?? '—'}% used)${disk.error ? `<div class="err">${escapeHtml(disk.error)}</div>` : ''}`),
    row('Cache', `${cache.rows.toLocaleString('en-IN')} rows in ${cache.tables} tables`),
    row('CPU load (1 min)', `${cpu.loadAverage1m} on ${cpu.cores} cores`)
  ].join('');

  const recent = (errors.recent || []).map((e) => `<li><span class="muted">${time(e.at)} · ${escapeHtml(e.route)}</span><br>${escapeHtml(e.message)}</li>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Backend status</title>
<style>
  :root { color-scheme: light dark; --bg:#f8fafc; --card:#fff; --text:#0f172a; --muted:#64748b; --line:#e2e8f0; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b1120; --card:#111827; --text:#e2e8f0; --muted:#94a3b8; --line:#1f2937; } }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; }
  main { max-width:760px; margin:0 auto; padding:24px 16px; }
  h1 { font-size:20px; margin:0 0 4px; display:flex; gap:10px; align-items:center; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin:24px 0 8px; }
  section { background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:10px 14px; border-top:1px solid var(--line); vertical-align:top; }
  tr:first-child th, tr:first-child td { border-top:0; }
  th { width:34%; font-weight:500; color:var(--muted); }
  .muted { color:var(--muted); font-size:12px; }
  .err { color:#b91c1c; font-size:12px; margin-top:4px; }
  ul { margin:0; padding:10px 14px 10px 30px; } li { margin:4px 0; }
  .warn { background:#b4530912; border:1px solid #b4530933; color:#b45309; border-radius:12px; padding:10px 14px; margin-top:16px; }
</style></head>
<body><main>
  <h1>Backend status ${badge(report.status)}</h1>
  <div class="muted">Checked ${time(report.checkedAt)} · up ${escapeHtml(duration(report.uptime.seconds))} · refreshes every 10 s on reload</div>
  ${report.warnings.length ? `<div class="warn">${report.warnings.map(escapeHtml).join('<br>')}</div>` : ''}
  <h2>Connections</h2><section><table>${checkRows}</table></section>
  <h2>Resources</h2><section><table>${resourceRows}</table></section>
  <h2>Server errors</h2><section><table>
    ${row('Since start', `${errors.count}${errors.lastAt ? ` · last ${time(errors.lastAt)}` : ''}`)}
  </table>${recent ? `<ul>${recent}</ul>` : ''}</section>
</main></body></html>`;
}

module.exports = { renderStatusPage };
