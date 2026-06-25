const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err.statusCode || 500;
  const isOperational = Boolean(err.statusCode); // expected errors carry a status
  const log = req.log || logger; // fall back to global logger if pino-http is off

  if (isOperational) {
    // Expected errors (auth, validation, not-found) — log at warn only.
    log.warn({ err: err.message, status }, 'Operational error');
  } else {
    // Unexpected — log full detail for debugging.
    log.error({ err: { message: err.message, stack: err.stack } }, 'Unhandled error');
  }

  res.status(status).json({
    error: isOperational
      ? err.publicMessage || 'Something went wrong.'
      : 'Something went wrong on our end.',
  });
}

module.exports = errorHandler;
