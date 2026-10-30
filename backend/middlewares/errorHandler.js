const { recordServerError } = require('../utils/errorStats');

function errorHandler(error, req, res, next) {
  // Errors without a status (or 5xx) are internal: database, network, bugs.
  // Their text can name tables, hosts or paths, so in production the client
  // only gets a generic message; the details stay in the server log.
  // multer's upload errors (too large, too many files) are the client's.
  // An error with `expose: true` carries a message written for the user.
  const fromMulter = error && error.name === 'MulterError';
  const statusCode = error.statusCode || error.status || (fromMulter ? 400 : 500);
  // Details (internal text, stack) only when explicitly switched on with
  // EXPOSE_ERROR_DETAILS=1, never from NODE_ENV alone: a live server started
  // with a copied development .env must not send stack traces to clients.
  const showDetails = String(process.env.EXPOSE_ERROR_DETAILS || '').trim() === '1';

  if (statusCode >= 500) {
    recordServerError(error, req);
    console.error(`[error] ${req.method} ${req.baseUrl || ''}${req.path || ''}:`, error);
  }

  const message = statusCode >= 500 && !showDetails && error.expose !== true
    ? 'Something went wrong. Please try again, or contact the administrator if it keeps happening.'
    : error.message || 'Internal Server Error';

  if (res.headersSent) return next(error);
  res.status(statusCode).json({
    success: false,
    message,
    // A machine-readable reason the page can act on (e.g. FY_CLOSED,
    // TB_IMBALANCE), for errors written for the user.
    ...(statusCode < 500 && error.code && typeof error.code === 'string' ? { code: error.code } : {}),
    ...(showDetails ? { stack: error.stack } : {})
  });
}

module.exports = errorHandler;
