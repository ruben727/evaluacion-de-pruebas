'use strict';

/**
 * Variables de entorno para las pruebas. Se cargan ANTES que cualquier módulo de la app.
 *
 * TEST_DATABASE_URL apunta por defecto al Postgres del docker-compose (puerto 5433 del host)
 * pero a una base de datos separada "app_test", para no tocar los datos reales.
 * En CI basta con exportar TEST_DATABASE_URL apuntando al servicio de Postgres.
 */
const { testDatabaseUrl } = require('./testDb');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRES_IN = '15m';
process.env.BCRYPT_ROUNDS = '4'; // hash rápido en pruebas
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL || 'silent'; // TEST_LOG_LEVEL=info para depurar
delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
