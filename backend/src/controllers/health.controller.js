'use strict';

const { query } = require('../db/pool');
const pkg = require('../../package.json');

/**
 * GET /api/health → estado de la API y de la BD.
 * 200 si todo está bien, 503 si la BD no responde (útil para healthchecks y balanceadores).
 */
async function health(_req, res) {
  const startedDb = Date.now();
  let database = { status: 'up' };
  try {
    await query('SELECT 1');
    database.latencyMs = Date.now() - startedDb;
  } catch (err) {
    database = { status: 'down', error: err.message };
  }

  const ok = database.status === 'up';
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    api: { status: 'up', version: pkg.version, uptimeSeconds: Math.round(process.uptime()) },
    database,
    timestamp: new Date().toISOString(),
  });
}

module.exports = { health };
