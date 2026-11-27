#!/usr/bin/env node
'use strict';

/**
 * Genera los dashboards de OpenObserve (formato de importación v8) y, opcionalmente,
 * valida TODAS sus consultas (y las de las alertas) contra un OpenObserve real.
 *
 *   node observability/dashboards/generate-dashboards.js              # escribe los *.dashboard.json
 *   OO_URL=http://localhost:5080 OO_USER=root@example.com OO_PASSWORD='...' \
 *     node observability/dashboards/generate-dashboards.js --validate  # además ejecuta cada consulta
 *
 * Streams usados:
 *   cicd_pipeline (logs)        eventos del pipeline enviados por GitHub Actions
 *   default (logs)              logs JSON del backend (method, route, statuscode, durationms...)
 *   app_http_* (metrics)        métricas propias del backend (OpenTelemetry)
 *   system_* (metrics)          métricas del host (OTel Collector, receiver host_metrics)
 *   host_temperature (logs)     sonda de temperatura
 */

const fs = require('fs');
const path = require('path');
const { ALERTS } = require('./alerts');

const OUT_DIR = __dirname;
const GRID = 192; // ancho de la cuadrícula de OpenObserve

// ---------------------------------------------------------------------------
// Helpers para construir paneles con el esquema v8
// ---------------------------------------------------------------------------
function baseConfig(overrides = {}) {
  return {
    show_legends: true,
    legends_position: 'bottom',
    decimals: 2,
    line_thickness: 1.5,
    step_value: '0',
    top_results_others: false,
    axis_border_show: false,
    label_option: { rotate: 0 },
    show_symbol: false,
    line_interpolation: 'smooth',
    legend_width: { unit: 'px' },
    legend_height: { unit: 'px' },
    base_map: { type: 'osm' },
    map_type: { type: 'world' },
    map_view: { zoom: 1, lat: 0, lng: 0 },
    map_symbol_style: { size: 'by Value', size_by_value: { min: 1, max: 100 }, size_fixed: 2 },
    drilldown: [],
    mark_line: [],
    override_config: [],
    connect_nulls: true,
    no_value_replacement: '',
    wrap_table_cells: false,
    table_transpose: false,
    table_dynamic_columns: false,
    mappings: [],
    color: { mode: 'palette-classic-by-series', fixedColor: ['#5960b2'], seriesBy: 'last', colorBySeries: [] },
    trellis: { layout: null, num_of_columns: 1, group_by_y_axis: false },
    show_gridlines: true,
    ...overrides,
  };
}

const field = (alias, label, { timestamp = false } = {}) => ({
  label,
  alias,
  column: alias,
  color: null,
  treatAsNonTimestamp: !timestamp,
  showFieldAsJson: false,
});

function sqlQuery({ sql, stream, streamType = 'logs', x = [], y = [], breakdown = [], min = 0, max = 100 }) {
  return {
    query: sql,
    vrlFunctionQuery: '',
    customQuery: true,
    fields: {
      stream,
      stream_type: streamType,
      x,
      y,
      z: [],
      breakdown,
      filter: { filterType: 'group', logicalOperator: 'AND', conditions: [] },
    },
    config: { promql_legend: '', layer_type: 'scatter', weight_fixed: 1, limit: 0, min, max, time_shift: [], query_label: '' },
    joins: [],
  };
}

function promQuery({ query, stream, legend = '', min = 0, max = 100 }) {
  return {
    query,
    vrlFunctionQuery: '',
    customQuery: true,
    fields: {
      stream,
      stream_type: 'metrics',
      x: [],
      y: [],
      z: [],
      breakdown: [],
      filter: { filterType: 'group', logicalOperator: 'AND', conditions: [] },
    },
    config: { promql_legend: legend, layer_type: 'scatter', weight_fixed: 1, limit: 0, min, max, time_shift: [], query_label: '' },
    joins: [],
  };
}

/** Panel SQL. x/breakdown/y son listas de [alias, etiqueta]. */
function sqlPanel({ type, title, description = '', sql, stream, streamType, x = [], y = [], breakdown = [], unit = 'default', decimals = 2, w, h, min, max, timeX = true, extraConfig = {} }) {
  return {
    type,
    title,
    description,
    config: baseConfig({ unit, decimals, ...extraConfig }),
    queryType: 'sql',
    queries: [
      sqlQuery({
        sql,
        stream,
        streamType,
        min,
        max,
        x: x.map(([a, l]) => field(a, l, { timestamp: timeX })),
        y: y.map(([a, l]) => field(a, l)),
        breakdown: breakdown.map(([a, l]) => ({ label: l, alias: a, column: a, color: null })),
      }),
    ],
    w,
    h,
  };
}

/** Panel PromQL: queries = [{ query, stream, legend }] */
function promPanel({ type, title, description = '', queries, unit = 'default', decimals = 2, w, h, min, max, extraConfig = {} }) {
  return {
    type,
    title,
    description,
    config: baseConfig({ unit, decimals, ...extraConfig }),
    queryType: 'promql',
    queries: queries.map((q) => promQuery({ ...q, min, max })),
    w,
    h,
  };
}

/** Coloca los paneles en filas de izquierda a derecha y añade id/layout. */
function layoutPanels(prefix, panels) {
  let x = 0;
  let y = 0;
  let rowH = 0;
  return panels.map((p, idx) => {
    const { w, h, ...rest } = p;
    if (x + w > GRID) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    const layout = { x, y, w, h, i: idx + 1 };
    x += w;
    rowH = Math.max(rowH, h);
    return { id: `${prefix}_${idx + 1}`, ...rest, layout, htmlContent: '', markdownContent: '', customChartContent: '' };
  });
}

function dashboard({ id, title, description, panels, period = '24h' }) {
  return {
    version: 8,
    dashboardId: id,
    title,
    description,
    role: '',
    owner: '',
    created: new Date().toISOString(),
    tabs: [{ tabId: 'default', name: 'Default', panels: layoutPanels(id, panels) }],
    variables: { list: [], showDynamicFilters: true },
    defaultDatetimeDuration: { type: 'relative', relativeTimePeriod: period, startTime: 0, endTime: 0 },
  };
}

// ---------------------------------------------------------------------------
// 1. Dashboard del pipeline (stream cicd_pipeline)
// ---------------------------------------------------------------------------
const CI = 'cicd_pipeline';
const pipelineDashboard = dashboard({
  id: 'cicd_pipeline',
  title: 'CI/CD - Pipeline de GitHub Actions',
  description: 'Ejecuciones de pruebas, éxitos vs fallos y despliegues a EC2 (stream cicd_pipeline)',
  period: '7d',
  panels: [
    sqlPanel({
      type: 'metric', title: 'Ejecuciones de pruebas', stream: CI, decimals: 0, w: 38, h: 8,
      sql: `SELECT COUNT(*) AS y_axis_1 FROM "${CI}" WHERE type = 'test'`, y: [['y_axis_1', 'Ejecuciones']],
    }),
    sqlPanel({
      type: 'metric', title: 'Pruebas exitosas', stream: CI, decimals: 0, w: 38, h: 8,
      sql: `SELECT COUNT(*) AS y_axis_1 FROM "${CI}" WHERE type = 'test' AND result = 'success'`, y: [['y_axis_1', 'Éxitos']],
      extraConfig: { color: { mode: 'fixed', fixedColor: ['#2e9e44'], seriesBy: 'last', colorBySeries: [] } },
    }),
    sqlPanel({
      type: 'metric', title: 'Pruebas fallidas', stream: CI, decimals: 0, w: 38, h: 8,
      sql: `SELECT COUNT(*) AS y_axis_1 FROM "${CI}" WHERE type = 'test' AND result = 'failure'`, y: [['y_axis_1', 'Fallos']],
      extraConfig: { color: { mode: 'fixed', fixedColor: ['#d93025'], seriesBy: 'last', colorBySeries: [] } },
    }),
    sqlPanel({
      type: 'metric', title: 'Tasa de éxito de pruebas (%)', stream: CI, unit: 'percent', decimals: 1, w: 39, h: 8,
      sql: `SELECT ROUND(100.0 * SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) / COUNT(*), 1) AS y_axis_1 FROM "${CI}" WHERE type = 'test'`,
      y: [['y_axis_1', 'Éxito %']],
    }),
    sqlPanel({
      type: 'metric', title: 'Despliegues exitosos', stream: CI, decimals: 0, w: 39, h: 8,
      sql: `SELECT COUNT(*) AS y_axis_1 FROM "${CI}" WHERE type = 'deploy' AND result = 'success'`, y: [['y_axis_1', 'Despliegues']],
      extraConfig: { color: { mode: 'fixed', fixedColor: ['#1a73e8'], seriesBy: 'last', colorBySeries: [] } },
    }),
    sqlPanel({
      type: 'stacked', title: 'Ejecuciones de pruebas en el tiempo (por resultado)', stream: CI, decimals: 0, w: 96, h: 14,
      sql: `SELECT histogram(_timestamp) AS x_axis_1, result AS breakdown_1, COUNT(*) AS y_axis_1 FROM "${CI}" WHERE type = 'test' GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1`,
      x: [['x_axis_1', 'Tiempo']], y: [['y_axis_1', 'Ejecuciones']], breakdown: [['breakdown_1', 'Resultado']],
    }),
    sqlPanel({
      type: 'stacked', title: 'Despliegues en el tiempo (por resultado)', stream: CI, decimals: 0, w: 96, h: 14,
      sql: `SELECT histogram(_timestamp) AS x_axis_1, result AS breakdown_1, COUNT(*) AS y_axis_1 FROM "${CI}" WHERE type = 'deploy' GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1`,
      x: [['x_axis_1', 'Tiempo']], y: [['y_axis_1', 'Despliegues']], breakdown: [['breakdown_1', 'Resultado']],
    }),
    sqlPanel({
      type: 'donut', title: 'Éxitos vs fallos (pruebas)', stream: CI, decimals: 0, w: 64, h: 14, timeX: false,
      sql: `SELECT result AS x_axis_1, COUNT(*) AS y_axis_1 FROM "${CI}" WHERE type = 'test' GROUP BY x_axis_1 ORDER BY y_axis_1 DESC`,
      x: [['x_axis_1', 'Resultado']], y: [['y_axis_1', 'Ejecuciones']],
    }),
    sqlPanel({
      type: 'bar', title: 'Fallos por suite de pruebas', stream: CI, decimals: 0, w: 64, h: 14, timeX: false,
      sql:
        `SELECT 'backend (Jest)' AS x_axis_1, SUM(CASE WHEN backend_tests = 'failure' THEN 1 ELSE 0 END) AS y_axis_1 FROM "${CI}" WHERE type = 'test' ` +
        `UNION ALL SELECT 'frontend (unitarias)' AS x_axis_1, SUM(CASE WHEN frontend_tests = 'failure' THEN 1 ELSE 0 END) AS y_axis_1 FROM "${CI}" WHERE type = 'test' ` +
        `UNION ALL SELECT 'e2e (Playwright)' AS x_axis_1, SUM(CASE WHEN e2e_tests = 'failure' THEN 1 ELSE 0 END) AS y_axis_1 FROM "${CI}" WHERE type = 'test'`,
      x: [['x_axis_1', 'Suite']], y: [['y_axis_1', 'Fallos']],
    }),
    sqlPanel({
      type: 'donut', title: 'Resultado de despliegues', stream: CI, decimals: 0, w: 64, h: 14, timeX: false,
      sql: `SELECT result AS x_axis_1, COUNT(*) AS y_axis_1 FROM "${CI}" WHERE type = 'deploy' GROUP BY x_axis_1 ORDER BY y_axis_1 DESC`,
      x: [['x_axis_1', 'Resultado']], y: [['y_axis_1', 'Despliegues']],
    }),
    sqlPanel({
      type: 'table', title: 'Últimas ejecuciones del pipeline', stream: CI, w: 192, h: 16,
      sql: `SELECT timestamp, type, result, branch, commit_short, commit_message, actor, backend_tests, frontend_tests, e2e_tests, run_url FROM "${CI}" ORDER BY _timestamp DESC LIMIT 50`,
    }),
  ],
});

// ---------------------------------------------------------------------------
// 2. Dashboard de la aplicación (logs JSON del backend + métricas OTel)
// ---------------------------------------------------------------------------
const LOGS = 'default';
const REQ = `"${LOGS}" WHERE statuscode IS NOT NULL AND route IS NOT NULL`;
const appDashboard = dashboard({
  id: 'app_backend',
  title: 'Aplicación - API backend',
  description: 'Latencia, peticiones por segundo, errores por endpoint y códigos HTTP (logs del backend y métricas OpenTelemetry)',
  period: '1h',
  panels: [
    sqlPanel({
      type: 'metric', title: 'Peticiones', stream: LOGS, decimals: 0, w: 48, h: 8,
      sql: `SELECT COUNT(*) AS y_axis_1 FROM ${REQ}`, y: [['y_axis_1', 'Peticiones']],
    }),
    sqlPanel({
      type: 'metric', title: 'Tasa de error 5xx (%)', stream: LOGS, unit: 'percent', decimals: 2, w: 48, h: 8,
      sql: `SELECT ROUND(100.0 * SUM(CASE WHEN statuscode >= 500 THEN 1 ELSE 0 END) / COUNT(*), 2) AS y_axis_1 FROM ${REQ}`,
      y: [['y_axis_1', 'Errores 5xx %']],
      extraConfig: { color: { mode: 'fixed', fixedColor: ['#d93025'], seriesBy: 'last', colorBySeries: [] } },
    }),
    sqlPanel({
      type: 'metric', title: 'Tasa de error 4xx + 5xx (%)', stream: LOGS, unit: 'percent', decimals: 2, w: 48, h: 8,
      sql: `SELECT ROUND(100.0 * SUM(CASE WHEN statuscode >= 400 THEN 1 ELSE 0 END) / COUNT(*), 2) AS y_axis_1 FROM ${REQ}`,
      y: [['y_axis_1', 'Errores %']],
    }),
    sqlPanel({
      type: 'metric', title: 'Latencia p95 (ms)', stream: LOGS, unit: 'milliseconds', decimals: 1, w: 48, h: 8,
      sql: `SELECT approx_percentile_cont(durationms, 0.95) AS y_axis_1 FROM ${REQ}`, y: [['y_axis_1', 'p95']],
    }),
    sqlPanel({
      type: 'line', title: 'Peticiones por segundo', stream: LOGS, unit: 'default', decimals: 2, w: 96, h: 14,
      sql: `SELECT histogram(_timestamp, '1 minute') AS x_axis_1, COUNT(*) / 60.0 AS y_axis_1 FROM ${REQ} GROUP BY x_axis_1 ORDER BY x_axis_1`,
      x: [['x_axis_1', 'Tiempo']], y: [['y_axis_1', 'req/s']],
    }),
    sqlPanel({
      type: 'line', title: 'Latencia p50 / p95 / p99 (ms)', stream: LOGS, unit: 'milliseconds', decimals: 1, w: 96, h: 14,
      sql:
        `SELECT histogram(_timestamp) AS x_axis_1, approx_percentile_cont(durationms, 0.5) AS y_axis_1, ` +
        `approx_percentile_cont(durationms, 0.95) AS y_axis_2, approx_percentile_cont(durationms, 0.99) AS y_axis_3 ` +
        `FROM ${REQ} GROUP BY x_axis_1 ORDER BY x_axis_1`,
      x: [['x_axis_1', 'Tiempo']], y: [['y_axis_1', 'p50'], ['y_axis_2', 'p95'], ['y_axis_3', 'p99']],
    }),
    sqlPanel({
      type: 'line', title: 'Latencia p95 por endpoint (ms)', stream: LOGS, unit: 'milliseconds', decimals: 1, w: 96, h: 14,
      sql: `SELECT histogram(_timestamp) AS x_axis_1, concat(method, ' ', route) AS breakdown_1, approx_percentile_cont(durationms, 0.95) AS y_axis_1 FROM ${REQ} GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1`,
      x: [['x_axis_1', 'Tiempo']], y: [['y_axis_1', 'p95']], breakdown: [['breakdown_1', 'Endpoint']],
    }),
    sqlPanel({
      type: 'stacked', title: 'Peticiones por statusCode', stream: LOGS, decimals: 0, w: 96, h: 14,
      sql: `SELECT histogram(_timestamp) AS x_axis_1, CAST(statuscode AS VARCHAR) AS breakdown_1, COUNT(*) AS y_axis_1 FROM ${REQ} GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1`,
      x: [['x_axis_1', 'Tiempo']], y: [['y_axis_1', 'Peticiones']], breakdown: [['breakdown_1', 'statusCode']],
    }),
    sqlPanel({
      type: 'line', title: 'Tasa de error en el tiempo (%)', stream: LOGS, unit: 'percent', decimals: 2, w: 96, h: 14,
      sql:
        `SELECT histogram(_timestamp) AS x_axis_1, ROUND(100.0 * SUM(CASE WHEN statuscode >= 500 THEN 1 ELSE 0 END) / COUNT(*), 2) AS y_axis_1, ` +
        `ROUND(100.0 * SUM(CASE WHEN statuscode >= 400 AND statuscode < 500 THEN 1 ELSE 0 END) / COUNT(*), 2) AS y_axis_2 ` +
        `FROM ${REQ} GROUP BY x_axis_1 ORDER BY x_axis_1`,
      x: [['x_axis_1', 'Tiempo']], y: [['y_axis_1', '5xx %'], ['y_axis_2', '4xx %']],
    }),
    sqlPanel({
      type: 'donut', title: 'Distribución de statusCode', stream: LOGS, decimals: 0, w: 64, h: 14, timeX: false,
      sql: `SELECT CAST(statuscode AS VARCHAR) AS x_axis_1, COUNT(*) AS y_axis_1 FROM ${REQ} GROUP BY x_axis_1 ORDER BY y_axis_1 DESC`,
      x: [['x_axis_1', 'statusCode']], y: [['y_axis_1', 'Peticiones']],
    }),
    sqlPanel({
      type: 'table', title: 'Errores por endpoint', stream: LOGS, w: 128, h: 14,
      sql:
        `SELECT method, route, COUNT(*) AS peticiones, ` +
        `SUM(CASE WHEN statuscode >= 400 AND statuscode < 500 THEN 1 ELSE 0 END) AS errores_4xx, ` +
        `SUM(CASE WHEN statuscode >= 500 THEN 1 ELSE 0 END) AS errores_5xx, ` +
        `ROUND(100.0 * SUM(CASE WHEN statuscode >= 400 THEN 1 ELSE 0 END) / COUNT(*), 2) AS pct_error, ` +
        `ROUND(approx_percentile_cont(durationms, 0.95), 1) AS p95_ms ` +
        `FROM ${REQ} GROUP BY method, route ORDER BY errores_5xx DESC, errores_4xx DESC`,
    }),
    promPanel({
      type: 'line', title: 'Peticiones/s por endpoint (métrica OTel app.http.requests)', unit: 'default', decimals: 2, w: 96, h: 14,
      queries: [{ query: 'sum by (http_route) (rate(app_http_requests[2m]))', stream: 'app_http_requests', legend: '{http_route}' }],
    }),
    promPanel({
      type: 'line', title: 'Latencia p95 por endpoint (histograma OTel, ms)', unit: 'milliseconds', decimals: 1, w: 96, h: 14,
      queries: [{
        query: 'histogram_quantile(0.95, sum by (le, http_route) (rate(app_http_request_duration_bucket[5m])))',
        stream: 'app_http_request_duration_bucket',
        legend: '{http_route}',
      }],
    }),
  ],
});

// ---------------------------------------------------------------------------
// 3. Dashboard del servidor (OTel Collector host_metrics)
// ---------------------------------------------------------------------------
const serverDashboard = dashboard({
  id: 'ec2_server',
  title: 'Servidor - EC2 (host metrics)',
  description: 'CPU, RAM, swap, ancho de banda, disco y temperatura de la instancia (OpenTelemetry Collector)',
  period: '1h',
  panels: [
    promPanel({
      type: 'gauge', title: 'CPU actual (%)', unit: 'percent', decimals: 1, w: 48, h: 10, min: 0, max: 100,
      queries: [{ query: '100 * (1 - avg(system_cpu_utilization{state="idle"}))', stream: 'system_cpu_utilization' }],
    }),
    promPanel({
      type: 'gauge', title: 'RAM usada (%)', unit: 'percent', decimals: 1, w: 48, h: 10, min: 0, max: 100,
      queries: [{ query: '100 * sum(system_memory_utilization{state="used"})', stream: 'system_memory_utilization' }],
    }),
    promPanel({
      type: 'gauge', title: 'Disco / usado (%)', unit: 'percent', decimals: 1, w: 48, h: 10, min: 0, max: 100,
      queries: [{ query: '100 * max(system_filesystem_utilization{mountpoint="/"})', stream: 'system_filesystem_utilization' }],
    }),
    promPanel({
      type: 'metric', title: 'Load average (1 min)', unit: 'default', decimals: 2, w: 48, h: 10,
      queries: [{ query: 'avg(system_cpu_load_average_1m)', stream: 'system_cpu_load_average_1m' }],
    }),
    sqlPanel({
      type: 'line', title: 'CPU usada (%)', stream: 'system_cpu_utilization', streamType: 'metrics', unit: 'percent', decimals: 1, w: 96, h: 14,
      sql: `SELECT histogram(_timestamp) AS x_axis_1, ROUND(100 * (1 - AVG(value)), 2) AS y_axis_1 FROM "system_cpu_utilization" WHERE state = 'idle' GROUP BY x_axis_1 ORDER BY x_axis_1`,
      x: [['x_axis_1', 'Tiempo']], y: [['y_axis_1', 'CPU %']],
    }),
    sqlPanel({
      type: 'area-stacked', title: 'CPU por estado (%) — "steal" alto = sin créditos de CPU en t3', stream: 'system_cpu_utilization', streamType: 'metrics', unit: 'percent', decimals: 1, w: 96, h: 14,
      sql: `SELECT histogram(_timestamp) AS x_axis_1, state AS breakdown_1, ROUND(100 * AVG(value), 2) AS y_axis_1 FROM "system_cpu_utilization" WHERE state <> 'idle' GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1`,
      x: [['x_axis_1', 'Tiempo']], y: [['y_axis_1', '%']], breakdown: [['breakdown_1', 'Estado']],
    }),
    sqlPanel({
      type: 'line', title: 'RAM usada (%)', stream: 'system_memory_utilization', streamType: 'metrics', unit: 'percent', decimals: 1, w: 96, h: 14,
      sql: `SELECT histogram(_timestamp) AS x_axis_1, ROUND(100 * AVG(value), 2) AS y_axis_1 FROM "system_memory_utilization" WHERE state = 'used' GROUP BY x_axis_1 ORDER BY x_axis_1`,
      x: [['x_axis_1', 'Tiempo']], y: [['y_axis_1', 'RAM %']],
    }),
    sqlPanel({
      type: 'area-stacked', title: 'Memoria por estado (bytes)', stream: 'system_memory_usage', streamType: 'metrics', unit: 'bytes', decimals: 1, w: 96, h: 14,
      sql: `SELECT histogram(_timestamp) AS x_axis_1, state AS breakdown_1, AVG(value) AS y_axis_1 FROM "system_memory_usage" GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1`,
      x: [['x_axis_1', 'Tiempo']], y: [['y_axis_1', 'Bytes']], breakdown: [['breakdown_1', 'Estado']],
    }),
    promPanel({
      type: 'line', title: 'Ancho de banda de red (bytes/s)', unit: 'bps', decimals: 1, w: 96, h: 14,
      queries: [{ query: 'sum by (direction) (rate(system_network_io[2m]))', stream: 'system_network_io', legend: '{direction}' }],
    }),
    promPanel({
      type: 'line', title: 'Swap usada (bytes)', unit: 'bytes', decimals: 1, w: 96, h: 14,
      queries: [{ query: 'sum(system_paging_usage{state="used"})', stream: 'system_paging_usage', legend: 'swap usada' }],
    }),
    promPanel({
      type: 'line', title: 'Disco: lectura / escritura (bytes/s)', unit: 'bps', decimals: 1, w: 96, h: 14,
      queries: [{ query: 'sum by (direction) (rate(system_disk_io[2m]))', stream: 'system_disk_io', legend: '{direction}' }],
    }),
    sqlPanel({
      type: 'line', title: 'Uso de filesystems (%)', stream: 'system_filesystem_utilization', streamType: 'metrics', unit: 'percent', decimals: 1, w: 96, h: 14,
      sql: `SELECT histogram(_timestamp) AS x_axis_1, mountpoint AS breakdown_1, ROUND(100 * MAX(value), 2) AS y_axis_1 FROM "system_filesystem_utilization" GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1`,
      x: [['x_axis_1', 'Tiempo']], y: [['y_axis_1', '%']], breakdown: [['breakdown_1', 'Mountpoint']],
    }),
    promPanel({
      type: 'line', title: 'Load average 1 / 5 / 15 min', unit: 'default', decimals: 2, w: 96, h: 14,
      queries: [
        { query: 'avg(system_cpu_load_average_1m)', stream: 'system_cpu_load_average_1m', legend: '1 min' },
        { query: 'avg(system_cpu_load_average_5m)', stream: 'system_cpu_load_average_5m', legend: '5 min' },
        { query: 'avg(system_cpu_load_average_15m)', stream: 'system_cpu_load_average_15m', legend: '15 min' },
      ],
    }),
    sqlPanel({
      type: 'table', title: 'Temperatura (sonda thermal-probe)', stream: 'host_temperature', w: 96, h: 14,
      sql: `SELECT * FROM "host_temperature" ORDER BY _timestamp DESC LIMIT 20`,
    }),
  ],
});

const DASHBOARDS = [
  ['cicd-pipeline.dashboard.json', pipelineDashboard],
  ['app-backend.dashboard.json', appDashboard],
  ['ec2-server.dashboard.json', serverDashboard],
];

// ---------------------------------------------------------------------------
// Validación contra un OpenObserve real
// ---------------------------------------------------------------------------
async function validate() {
  const base = (process.env.OO_URL || 'http://localhost:5080').replace(/\/$/, '');
  const org = process.env.OO_ORG || 'default';
  const auth = 'Basic ' + Buffer.from(`${process.env.OO_USER}:${process.env.OO_PASSWORD}`).toString('base64');
  const end = Date.now();
  const start = end - Number(process.env.VALIDATE_HOURS || 24) * 3600e3;
  let failures = 0;

  async function runSql(sql, streamType) {
    const res = await fetch(`${base}/api/${org}/_search?type=${streamType}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth },
      body: JSON.stringify({ query: { sql, start_time: start * 1000, end_time: end * 1000, from: 0, size: 100 } }),
    });
    const body = await res.json();
    if (!res.ok || !Array.isArray(body.hits)) throw new Error(JSON.stringify(body).slice(0, 300));
    return body.hits.length;
  }

  async function runProm(query) {
    const url = new URL(`${base}/api/${org}/prometheus/api/v1/query_range`);
    url.search = new URLSearchParams({ query, start: String(Math.floor(start / 1000)), end: String(Math.floor(end / 1000)), step: '300' });
    const res = await fetch(url, { headers: { authorization: auth } });
    const body = await res.json();
    if (!res.ok || body.status !== 'success') throw new Error(JSON.stringify(body).slice(0, 300));
    return body.data.result.length;
  }

  const report = async (label, fn) => {
    try {
      const n = await fn();
      console.log(`  ${n > 0 ? 'OK   ' : 'VACIO'} ${label} (${n} filas/series)`);
    } catch (err) {
      failures += 1;
      console.log(`  ERROR ${label}: ${err.message}`);
    }
  };

  for (const [file, d] of DASHBOARDS) {
    console.log(`\n${file}`);
    for (const p of d.tabs[0].panels) {
      for (const q of p.queries) {
        await report(p.title, () => (p.queryType === 'promql' ? runProm(q.query) : runSql(q.query, q.fields.stream_type)));
      }
    }
  }
  console.log('\nAlertas');
  for (const a of ALERTS) {
    // Para validar la sintaxis se ejecuta también la versión sin umbral (debe devolver filas)
    await report(`${a.name} (consulta de la alerta)`, () => runSql(a.sql, a.streamType));
    await report(`${a.name} (sin umbral)`, () => runSql(a.sqlWithoutThreshold, a.streamType));
  }
  console.log(failures ? `\n${failures} consulta(s) con ERROR` : '\nTodas las consultas se ejecutaron sin errores');
  process.exitCode = failures ? 1 : 0;
}

// ---------------------------------------------------------------------------
for (const [file, d] of DASHBOARDS) {
  fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify(d, null, 2) + '\n');
  console.log(`Escrito ${path.join('observability/dashboards', file)} (${d.tabs[0].panels.length} paneles)`);
}
if (process.argv.includes('--validate')) {
  validate().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
