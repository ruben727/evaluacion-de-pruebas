'use strict';

const logger = require('../logger');
const HttpError = require('../utils/HttpError');

function notFound(req, _res, next) {
  next(HttpError.notFound(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

/**
 * Manejador central de errores: traduce cualquier error a una respuesta JSON
 * con el código HTTP adecuado. Los errores inesperados devuelven 500 sin filtrar detalles.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = err.statusCode || err.status || 500;
  let message = err.message;
  let details = err.details;

  // JSON mal formado en el body
  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'El cuerpo de la petición no es un JSON válido';
  }

  // Violación de unicidad en PostgreSQL (carrera entre dos inserts con el mismo correo)
  if (err.code === '23505') {
    status = 409;
    message = 'El correo ya está registrado';
  }

  if (!(err instanceof HttpError) && status >= 500) {
    logger.error({ err, method: req.method, path: req.originalUrl }, 'Error no controlado');
    message = 'Error interno del servidor';
    details = undefined;
  }

  const body = { error: { status, message } };
  if (details) body.error.details = details;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
