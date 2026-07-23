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
const { ensureDatabase } = require('./config/initDb');
const { closeMongo } = require('./config/mongo');
const { startAutomationScheduler, stopAutomationScheduler } = require('./services/automation.service');

const app = express();
const PORT = Number(process.env.PORT || 5000);
const API_PREFIX = process.env.API_PREFIX || '/api';
const UPLOAD_ROOT = path.join(__dirname, 'uploads');

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.use('/uploads', express.static(UPLOAD_ROOT));

app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Bank backend is running',
    apiPrefix: API_PREFIX
  });
});

app.use(API_PREFIX, apiRoutes);
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
      await closeMongo();
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
