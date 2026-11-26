'use strict';

const logger = require('../logger');
const { recordRequest } = require('../metrics');

const API_PREFIX = '/api';

/**
 * Registra cada petición en JSON (método, ruta, statusCode, duración, timestamp)
 * y alimenta las métricas por endpoint.
 */
function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    // Ruta "plantilla" (p.ej. /api/users/:id) para no disparar la cardinalidad de las métricas.
    const route = req.route ? `${API_PREFIX}${req.route.path}` : 'unmatched';
    const entry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      route,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      userId: req.user?.id,
    };

    recordRequest({ method: req.method, route, statusCode: res.statusCode, durationMs });

    let level = 'info';
    if (res.statusCode >= 500) level = 'error';
    else if (res.statusCode >= 400) level = 'warn';
    logger[level](entry, `${req.method} ${req.originalUrl} ${res.statusCode} ${entry.durationMs}ms`);
  });

  next();
}

module.exports = { requestLogger };
