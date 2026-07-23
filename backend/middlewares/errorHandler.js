function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || error.status || 500;
  const message = error.message || 'Internal Server Error';

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== 'production' ? { stack: error.stack } : {})
  });
}

module.exports = errorHandler;
