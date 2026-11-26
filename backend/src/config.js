'use strict';

/**
 * Configuración centralizada a partir de variables de entorno.
 * Ningún secreto está "hardcodeado": en producción todo viene del entorno (.env / docker-compose).
 */
function buildDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const user = process.env.POSTGRES_USER || 'postgres';
  const password = process.env.POSTGRES_PASSWORD || 'postgres';
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = process.env.POSTGRES_PORT || '5432';
  const db = process.env.POSTGRES_DB || 'app';
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  isTest: env === 'test',
  port: Number(process.env.PORT || 3000),
  databaseUrl: buildDatabaseUrl(),
  jwt: {
    secret: process.env.JWT_SECRET || (env === 'production' ? undefined : 'dev-secret-change-me'),
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),
  admin: {
    name: process.env.ADMIN_NAME || 'Administrador',
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },
  corsOrigin: process.env.CORS_ORIGIN || '*',
  logLevel: process.env.LOG_LEVEL || (env === 'test' ? 'silent' : 'info'),
  serviceName: process.env.OTEL_SERVICE_NAME || 'pruebas-final-backend',
};

if (!config.jwt.secret) {
  throw new Error('JWT_SECRET es obligatorio en producción');
}

module.exports = config;
