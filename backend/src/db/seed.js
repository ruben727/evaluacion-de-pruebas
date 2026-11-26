'use strict';

const bcrypt = require('bcryptjs');
const config = require('../config');
const logger = require('../logger');
const { query } = require('./pool');

/**
 * Crea el usuario administrador inicial (ADMIN_EMAIL / ADMIN_PASSWORD) si no existe.
 */
async function seedAdmin() {
  const { name, email, password } = config.admin;
  if (!email || !password) {
    logger.warn('ADMIN_EMAIL/ADMIN_PASSWORD no definidos: no se crea usuario admin inicial');
    return;
  }

  const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (existing.rowCount > 0) {
    logger.info({ email }, 'El usuario admin ya existe');
    return;
  }

  const hash = await bcrypt.hash(password, config.bcryptRounds);
  await query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, LOWER($2), $3) ON CONFLICT DO NOTHING',
    [name, email, hash],
  );
  logger.info({ email }, 'Usuario admin inicial creado');
}

module.exports = { seedAdmin };
