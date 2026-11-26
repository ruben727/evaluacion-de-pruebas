'use strict';

const pino = require('pino');
const config = require('./config');

/**
 * Logger estructurado en JSON.
 * Cuando OpenTelemetry está activo, @opentelemetry/instrumentation-pino
 * añade trace_id/span_id a cada línea y reenvía los registros por OTLP.
 */
const logger = pino({
  level: config.logLevel,
  base: { service: config.serviceName, env: config.env },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: ['password', '*.password', 'req.headers.authorization'],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
