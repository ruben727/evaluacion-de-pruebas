'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const HttpError = require('../utils/HttpError');

/**
 * Verifica el JWT enviado como "Authorization: Bearer <token>".
 * Si es válido deja el payload en req.user; si no, responde 401.
 */
function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(HttpError.unauthorized('Token de autenticación requerido'));
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = { id: Number(payload.sub), email: payload.email, name: payload.name };
    return next();
  } catch {
    return next(HttpError.unauthorized('Token inválido o expirado'));
  }
}

module.exports = { requireAuth };
