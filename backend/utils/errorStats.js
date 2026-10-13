// Server errors (5xx) seen since this process started, for the status page.
// Only the newest few are kept, in memory; the full error is in the log.
const MAX_RECENT = 10;
const started = new Date(Date.now() - process.uptime() * 1000);
let count = 0;
const recent = [];

function recordServerError(error, req = {}) {
  count += 1;
  recent.unshift({
    at: new Date().toISOString(),
    route: `${req.method || ''} ${req.baseUrl || ''}${req.path || ''}`.trim(),
    message: String(error?.message || error || 'Unknown error').slice(0, 300)
  });
  recent.length = Math.min(recent.length, MAX_RECENT);
}

function getErrorStats() {
  return { since: started.toISOString(), count, lastAt: recent[0]?.at || null, recent: recent.slice() };
}

module.exports = { getErrorStats, recordServerError };
