'use strict';

/**
 * Inicialización de OpenTelemetry. Se carga ANTES que la app:
 *   node --require ./src/instrumentation.js src/server.js
 *
 * Solo se activa si OTEL_EXPORTER_OTLP_ENDPOINT está definido (y OTEL_SDK_DISABLED no es "true").
 * Si no, la app funciona exactamente igual sin enviar telemetría.
 *
 * Variables (los exportadores OTLP las leen directamente del entorno):
 *   OTEL_EXPORTER_OTLP_ENDPOINT  p.ej. https://api.openobserve.ai/api/<organizacion>
 *   OTEL_EXPORTER_OTLP_HEADERS   p.ej. Authorization=Basic%20<base64(usuario:contraseña)>
 *   OTEL_SERVICE_NAME            nombre del servicio en OpenObserve
 *
 * Alternativa a OTEL_EXPORTER_OTLP_HEADERS: definir OPENOBSERVE_USER y OPENOBSERVE_PASSWORD
 * y la cabecera "Authorization: Basic ..." se construye aquí (sin calcular base64 a mano).
 */
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (!process.env.OTEL_EXPORTER_OTLP_HEADERS && process.env.OPENOBSERVE_USER && process.env.OPENOBSERVE_PASSWORD) {
  const basic = Buffer.from(`${process.env.OPENOBSERVE_USER}:${process.env.OPENOBSERVE_PASSWORD}`).toString('base64');
  process.env.OTEL_EXPORTER_OTLP_HEADERS = `Authorization=${encodeURIComponent(`Basic ${basic}`)}`;
}
const disabled = String(process.env.OTEL_SDK_DISABLED).toLowerCase() === 'true';

function bootLog(msg, extra = {}) {
  if (process.env.NODE_ENV === 'test') return;
  // Se usa console porque el logger de la app aún no está cargado (y no debe cargarse antes que OTel).
  console.log(JSON.stringify({ level: 'info', time: new Date().toISOString(), msg, ...extra }));
}

if (!endpoint || disabled) {
  bootLog('OpenTelemetry desactivado (OTEL_EXPORTER_OTLP_ENDPOINT no definido o OTEL_SDK_DISABLED=true)');
  module.exports = { enabled: false };
} else {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
  const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
  const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');

  const serviceName = process.env.OTEL_SERVICE_NAME || 'pruebas-final-backend';
  const exportIntervalMillis = Number(process.env.OTEL_METRIC_EXPORT_INTERVAL || 15000);

  const sdk = new NodeSDK({
    serviceName,
    // Endpoint y cabeceras vienen de OTEL_EXPORTER_OTLP_* (se añade /v1/traces, /v1/metrics, /v1/logs).
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis,
    }),
    // sdk-logs 3.x: el procesador recibe un objeto de opciones { exporter }
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [
      getNodeAutoInstrumentations({
        // Instrumentaciones ruidosas que no aportan en esta app
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        // Express (rutas) y pg (consultas SQL) quedan activas por defecto
        '@opentelemetry/instrumentation-pg': { enhancedDatabaseReporting: false },
        // Inyecta trace_id/span_id en los logs de pino y los reenvía por OTLP
        '@opentelemetry/instrumentation-pino': { disableLogSending: false },
      }),
    ],
  });

  sdk.start();
  bootLog('OpenTelemetry activado', { serviceName, endpoint });

  const shutdown = () => {
    sdk
      .shutdown()
      .catch((err) => console.error('Error al cerrar OpenTelemetry', err))
      .finally(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  module.exports = { enabled: true, sdk };
}
