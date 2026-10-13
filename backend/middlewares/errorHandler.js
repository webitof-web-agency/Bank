const { recordServerError } = require('../utils/errorStats');

function errorHandler(error, req, res, next) {
  // Errors without a status (or 5xx) are internal: database, network, bugs.
  // Their text can name tables, hosts or paths, so in production the client
  // only gets a generic message; the details stay in the server log.
  // multer's upload errors (too large, too many files) are the client's.
  // An error with `expose: true` carries a message written for the user.
  const fromMulter = error && error.name === 'MulterError';
  const statusCode = error.statusCode || error.status || (fromMulter ? 400 : 500);
  const isProduction = process.env.NODE_ENV === 'production';

  if (statusCode >= 500) {
    recordServerError(error, req);
    console.error(`[error] ${req.method} ${req.baseUrl || ''}${req.path || ''}:`, error);
  }

  const message = statusCode >= 500 && isProduction && error.expose !== true
    ? 'Something went wrong. Please try again, or contact the administrator if it keeps happening.'
    : error.message || 'Internal Server Error';

  if (res.headersSent) return next(error);
  res.status(statusCode).json({
    success: false,
    message,
    ...(!isProduction ? { stack: error.stack } : {})
  });
}

module.exports = errorHandler;
