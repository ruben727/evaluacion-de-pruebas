'use strict';

const fs = require('fs');
const path = require('path');

// En local reutiliza las credenciales del .env de la raíz (sin sobrescribir variables ya definidas).
const rootEnv = path.resolve(__dirname, '..', '..', '.env');
if (!process.env.TEST_DATABASE_URL && fs.existsSync(rootEnv)) {
  const saved = { ...process.env };
  process.loadEnvFile(rootEnv);
  Object.assign(process.env, saved);
}

function defaultUrl() {
  const user = process.env.POSTGRES_USER || 'postgres';
  const password = process.env.POSTGRES_PASSWORD || 'postgres';
  const host = 'localhost';
  const port = process.env.DB_HOST_PORT || '5433';
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/app_test`;
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL || defaultUrl();

module.exports = { testDatabaseUrl };
