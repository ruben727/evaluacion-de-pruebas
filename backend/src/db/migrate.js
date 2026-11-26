'use strict';

const { pool } = require('./pool');
const logger = require('../logger');

/**
 * Migración simple e idempotente: crea la tabla users si no existe.
 * El índice único sobre LOWER(email) garantiza correos únicos sin distinguir mayúsculas.
 */
const MIGRATION_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));
`;

async function migrate() {
  // Un advisory lock evita condiciones de carrera si arrancan varias instancias a la vez.
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(724519)');
    await client.query(MIGRATION_SQL);
    logger.info('Migración aplicada: tabla users lista');
  } finally {
    await client.query('SELECT pg_advisory_unlock(724519)').catch(() => {});
    client.release();
  }
}

module.exports = { migrate };
