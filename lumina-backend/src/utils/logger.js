const pino = require('pino');
const env = require('../config/env');

// One logger for the whole process. pino-http also gets this instance.
// In development the output is pretty-printed for readability; in production
// we ship newline-delimited JSON for log drains (Render/Railway/Logtail).
const logger = pino(
  env.isProduction
    ? { level: process.env.LOG_LEVEL || 'info' }
    : {
        level: process.env.LOG_LEVEL || 'debug',
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }
);

module.exports = logger;
