'use strict';

const { Client } = require('pg');
const { testDatabaseUrl } = require('./testDb');

/**
 * Crea la base de datos de pruebas si no existe (conectándose a la BD "postgres"
 * del mismo servidor). Así funciona igual en local y en un servicio de CI.
 */
module.exports = async function globalSetup() {
  const url = new URL(testDatabaseUrl);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  const adminUrl = new URL(testDatabaseUrl);
  adminUrl.pathname = '/postgres';

  const client = new Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `No se pudo conectar a PostgreSQL (${url.host}). ¿Está levantado? ` +
        `Ejecuta "docker compose up -d db" o define TEST_DATABASE_URL. Detalle: ${err.message}`,
    );
  }
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }
};
