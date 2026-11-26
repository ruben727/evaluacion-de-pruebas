'use strict';

/**
 * Error con código HTTP. Lo lanzan controladores/middlewares y lo
 * traduce a respuesta JSON el manejador central de errores.
 */
class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    if (details) this.details = details;
  }

  static badRequest(message = 'Solicitud inválida', details) {
    return new HttpError(400, message, details);
  }

  static unauthorized(message = 'No autorizado') {
    return new HttpError(401, message);
  }

  static notFound(message = 'Recurso no encontrado') {
    return new HttpError(404, message);
  }

  static conflict(message = 'Conflicto') {
    return new HttpError(409, message);
  }
}

module.exports = HttpError;
