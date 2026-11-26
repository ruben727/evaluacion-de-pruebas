'use strict';

const { Router } = require('express');

/**
 * Router principal montado en /api.
 * Las rutas se declaran con su ruta completa (p.ej. /users/:id) para que logs y
 * métricas usen siempre la ruta "plantilla", incluso cuando la petición termina en error.
 * Express 5 propaga automáticamente los errores de handlers async al manejador central.
 */
const API_PREFIX = '/api';

const apiRouter = Router();
apiRouter.use(require('./health.routes'));
apiRouter.use(require('./auth.routes'));
apiRouter.use(require('./users.routes'));

module.exports = { API_PREFIX, apiRouter };
