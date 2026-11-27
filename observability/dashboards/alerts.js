'use strict';

/**
 * Consultas SQL de las alertas programadas (scheduled alerts) de OpenObserve.
 * Se copian tal cual en la UI (ver docs/OPENOBSERVE.md). La alerta se dispara cuando
 * la consulta devuelve al menos 1 fila en el periodo evaluado.
 *
 * "sqlWithoutThreshold" es la misma consulta sin el umbral: solo se usa para validar
 * la sintaxis con datos reales (generate-dashboards.js --validate).
 */
const ERRORS_5XX = 'SUM(CASE WHEN statuscode >= 500 THEN 1 ELSE 0 END)';

const ALERTS = [
  {
    name: 'Tasa de errores HTTP 5xx > 5%',
    stream: 'default',
    streamType: 'logs',
    period: '5 minutos',
    frequency: '1 minuto',
    sql:
      `SELECT COUNT(*) AS total_peticiones, ${ERRORS_5XX} AS errores_5xx, ` +
      `ROUND(100.0 * ${ERRORS_5XX} / COUNT(*), 2) AS tasa_error_pct ` +
      `FROM "default" WHERE statuscode IS NOT NULL ` +
      `HAVING COUNT(*) >= 20 AND 100.0 * ${ERRORS_5XX} / COUNT(*) > 5`,
    sqlWithoutThreshold:
      `SELECT COUNT(*) AS total_peticiones, ${ERRORS_5XX} AS errores_5xx, ` +
      `ROUND(100.0 * ${ERRORS_5XX} / COUNT(*), 2) AS tasa_error_pct ` +
      `FROM "default" WHERE statuscode IS NOT NULL`,
  },
  {
    name: 'CPU del servidor > 80%',
    stream: 'system_cpu_utilization',
    streamType: 'metrics',
    period: '5 minutos',
    frequency: '1 minuto',
    sql:
      `SELECT host_name, ROUND(100 * (1 - AVG(value)), 2) AS cpu_pct ` +
      `FROM "system_cpu_utilization" WHERE state = 'idle' ` +
      `GROUP BY host_name HAVING 100 * (1 - AVG(value)) > 80`,
    sqlWithoutThreshold:
      `SELECT host_name, ROUND(100 * (1 - AVG(value)), 2) AS cpu_pct ` +
      `FROM "system_cpu_utilization" WHERE state = 'idle' GROUP BY host_name`,
  },
  {
    name: 'RAM del servidor > 90%',
    stream: 'system_memory_utilization',
    streamType: 'metrics',
    period: '5 minutos',
    frequency: '1 minuto',
    sql:
      `SELECT host_name, ROUND(100 * AVG(value), 2) AS ram_pct ` +
      `FROM "system_memory_utilization" WHERE state = 'used' ` +
      `GROUP BY host_name HAVING 100 * AVG(value) > 90`,
    sqlWithoutThreshold:
      `SELECT host_name, ROUND(100 * AVG(value), 2) AS ram_pct ` +
      `FROM "system_memory_utilization" WHERE state = 'used' GROUP BY host_name`,
  },
  {
    name: 'Pipeline con pruebas fallidas',
    stream: 'cicd_pipeline',
    streamType: 'logs',
    period: '10 minutos',
    frequency: '5 minutos',
    sql:
      `SELECT branch, commit_short, actor, run_url, e2e_tests, backend_tests, frontend_tests ` +
      `FROM "cicd_pipeline" WHERE type = 'test' AND result = 'failure'`,
    sqlWithoutThreshold:
      `SELECT branch, commit_short, actor, run_url, e2e_tests, backend_tests, frontend_tests ` +
      `FROM "cicd_pipeline" WHERE type = 'test'`,
  },
];

module.exports = { ALERTS };
