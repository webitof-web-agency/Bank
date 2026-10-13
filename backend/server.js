const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const apiRoutes = require('./routes');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');
const { requireAuth } = require('./middlewares/auth');
const { apiRateLimit } = require('./middlewares/rateLimit');
const { rejectUnsafeKeys } = require('./middlewares/inputSafety');
const { getSystemStatus, toPublicStatus } = require('./services/systemStatus.service');
const { renderStatusPage } = require('./utils/statusPage');
const { ensureDatabase } = require('./config/initDb');
const { closeDatabase } = require('./config/postgres');
const { buildCorsOptions, validateSecurityConfig } = require('./config/security');
const { validateSmsConfig } = require('./config/sms');
const { startAutomationScheduler, stopAutomationScheduler } = require('./services/automation.service');

validateSecurityConfig();
validateSmsConfig();

const app = express();
const PORT = Number(process.env.PORT || 5000);
const API_PREFIX = process.env.API_PREFIX || '/api';
const UPLOAD_ROOT = path.join(__dirname, 'uploads');

app.disable('x-powered-by');
// Behind a reverse proxy (nginx, a load balancer) set TRUST_PROXY to the
// number of proxy hops (usually 1), so req.ip is the client's address and
// rate limits apply per client rather than to everyone at once.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isInteger(hops) ? hops : process.env.TRUST_PROXY);
}
app.use(helmet());
app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(rejectUnsafeKeys);
// Request log without secrets: signed file links, OAuth codes and the like
// carry them in the query string.
const SECRET_QUERY_PARAMS = /^(token|access_token|refresh_token|id_token|code|state|password|secret|key|sig|signature)$/i;
morgan.token('url', (req) => {
  const raw = req.originalUrl || req.url;
  const queryAt = raw.indexOf('?');
  if (queryAt === -1) return raw;
  const params = new URLSearchParams(raw.slice(queryAt + 1));
  for (const name of [...params.keys()]) {
    if (SECRET_QUERY_PARAMS.test(name)) params.set(name, '[redacted]');
  }
  return `${raw.slice(0, queryAt)}?${params.toString()}`;
});
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use('/uploads', requireAuth, express.static(UPLOAD_ROOT, {
  etag: false,
  fallthrough: false,
  lastModified: false,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; sandbox");
  }
}));

// Status page: connections, server errors, memory / disk / cache. Public,
// so it shows states and numbers only (details: GET /api/system/status).
// HTTP 503 while the database is down, for uptime monitors.
app.get('/', async (req, res, next) => {
  try {
    const report = toPublicStatus(await getSystemStatus());
    res.status(report.status === 'down' ? 503 : 200).set('Cache-Control', 'no-store');
    if (req.accepts(['json', 'html']) === 'html') return res.type('html').send(renderStatusPage(report));
    return res.json({ success: report.status !== 'down', ...report });
  } catch (error) {
    return next(error);
  }
});

app.use(API_PREFIX, apiRateLimit, apiRoutes);
app.use(notFound);
app.use(errorHandler);

async function start() {
  await ensureDatabase();
  startAutomationScheduler();
  const server = http.createServer(app);

  server.listen(PORT, () => {
    console.log(`Bank API listening on port ${PORT}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      stopAutomationScheduler();
      await closeDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start backend:', error);
    process.exit(1);
  });
}

module.exports = app;

