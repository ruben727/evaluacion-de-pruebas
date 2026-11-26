'use strict';

const { Pool } = require('pg');
const config = require('../config');
const logger = require('../logger');

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Error inesperado en un cliente inactivo del pool de PostgreSQL');
});

const query = (text, params) => pool.query(text, params);

/**
 * Espera a que la BD acepte conexiones (además del healthcheck de docker-compose).
 */
async function waitForDatabase({ retries = 30, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      logger.info({ attempt }, 'Conexión con PostgreSQL establecida');
      return;
    } catch (err) {
      logger.warn({ attempt, retries, err: err.message }, 'PostgreSQL no disponible todavía, reintentando...');
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = { pool, query, waitForDatabase };
