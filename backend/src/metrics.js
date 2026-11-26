'use strict';

const { metrics } = require('@opentelemetry/api');
const config = require('./config');

/**
 * Métricas HTTP propias por endpoint (además de las que genera la
 * auto-instrumentación http: http.server.request.duration).
 * Si el SDK de OpenTelemetry no está activo, la API devuelve un meter
 * "no-op" y estas llamadas no hacen nada.
 */
const meter = metrics.getMeter(config.serviceName, '1.0.0');

const requestCounter = meter.createCounter('app.http.requests', {
  description: 'Número de peticiones HTTP recibidas por endpoint',
  unit: '{request}',
});

const errorCounter = meter.createCounter('app.http.errors', {
  description: 'Número de respuestas HTTP con error (status >= 400) por endpoint',
  unit: '{request}',
});

const durationHistogram = meter.createHistogram('app.http.request.duration', {
  description: 'Latencia de las peticiones HTTP por endpoint',
  unit: 'ms',
  advice: {
    explicitBucketBoundaries: [5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000],
  },
});

function recordRequest({ method, route, statusCode, durationMs }) {
  const attributes = {
    'http.request.method': method,
    'http.route': route,
    'http.response.status_code': statusCode,
  };
  requestCounter.add(1, attributes);
  durationHistogram.record(durationMs, attributes);
  if (statusCode >= 400) {
    errorCounter.add(1, {
      ...attributes,
      'error.type': statusCode >= 500 ? 'server_error' : 'client_error',
    });
  }
}

module.exports = { recordRequest };
