'use strict';

const config = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');
const { pool, waitForDatabase } = require('./db/pool');
const { migrate } = require('./db/migrate');
const { seedAdmin } = require('./db/seed');

async function main() {
  await waitForDatabase();
  await migrate();
  await seedAdmin();

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'API escuchando');
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'Cerrando servidor...');
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'No se pudo iniciar la API');
  process.exit(1);
});
