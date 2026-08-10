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
const { ensureDatabase } = require('./config/initDb');
const { closeDatabase } = require('./config/postgres');
const { buildCorsOptions, validateSecurityConfig } = require('./config/security');
const { startAutomationScheduler, stopAutomationScheduler } = require('./services/automation.service');

validateSecurityConfig();

const app = express();
const PORT = Number(process.env.PORT || 5000);
const API_PREFIX = process.env.API_PREFIX || '/api';
const UPLOAD_ROOT = path.join(__dirname, 'uploads');

app.disable('x-powered-by');
app.use(helmet());
app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use('/uploads', requireAuth, express.static(UPLOAD_ROOT, {
  etag: false,
  fallthrough: false,
  lastModified: false,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Bank backend is running',
    apiPrefix: API_PREFIX
  });
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

