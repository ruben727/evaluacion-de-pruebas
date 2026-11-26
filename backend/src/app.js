'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const { API_PREFIX, apiRouter } = require('./routes');
const { requestLogger } = require('./middlewares/requestLogger');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

/**
 * Crea la app Express sin escuchar en ningún puerto (así Supertest puede usarla directamente).
 */
function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // detrás de nginx

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') }));
  app.use(express.json({ limit: '100kb' }));
  app.use(requestLogger);

  app.use(API_PREFIX, apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
