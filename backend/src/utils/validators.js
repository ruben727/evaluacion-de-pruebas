'use strict';

const HttpError = require('./HttpError');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 72; // límite de bcrypt
const MAX_NAME = 100;

const isString = (v) => typeof v === 'string';

/**
 * Valida los datos de un usuario.
 * @param {object} body
 * @param {{ partial?: boolean, requirePassword?: boolean }} options
 *   partial: true en actualizaciones (solo se validan los campos enviados)
 * @returns {{ name?: string, email?: string, password?: string }} datos normalizados
 */
function validateUser(body, { partial = false, requirePassword = true } = {}) {
  const errors = {};
  const data = {};
  const input = body && typeof body === 'object' ? body : {};

  if (!partial || input.name !== undefined) {
    if (!isString(input.name) || input.name.trim().length < 2) {
      errors.name = 'El nombre es obligatorio (mínimo 2 caracteres)';
    } else if (input.name.trim().length > MAX_NAME) {
      errors.name = `El nombre no puede superar ${MAX_NAME} caracteres`;
    } else {
      data.name = input.name.trim();
    }
  }

  if (!partial || input.email !== undefined) {
    if (!isString(input.email) || !EMAIL_REGEX.test(input.email.trim())) {
      errors.email = 'El correo no es válido';
    } else {
      data.email = input.email.trim().toLowerCase();
    }
  }

  const mustValidatePassword = (!partial && requirePassword) || (input.password !== undefined && input.password !== '');
  if (mustValidatePassword) {
    if (!isString(input.password) || input.password.length < MIN_PASSWORD) {
      errors.password = `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`;
    } else if (Buffer.byteLength(input.password, 'utf8') > MAX_PASSWORD) {
      errors.password = `La contraseña no puede superar ${MAX_PASSWORD} bytes`;
    } else {
      data.password = input.password;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw HttpError.badRequest('Datos inválidos', errors);
  }
  return data;
}

function validateLogin(body) {
  const input = body && typeof body === 'object' ? body : {};
  const errors = {};
  if (!isString(input.email) || !input.email.trim()) errors.email = 'El correo es obligatorio';
  if (!isString(input.password) || !input.password) errors.password = 'La contraseña es obligatoria';
  if (Object.keys(errors).length > 0) throw HttpError.badRequest('Datos inválidos', errors);
  return { email: input.email.trim().toLowerCase(), password: input.password };
}

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) {
    throw HttpError.badRequest('El id debe ser un entero positivo');
  }
  return id;
}

module.exports = { validateUser, validateLogin, parseId };
