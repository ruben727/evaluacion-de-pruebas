'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const HttpError = require('../utils/HttpError');
const { validateUser, validateLogin } = require('../utils/validators');
const users = require('../db/users.repository');

function signToken(user) {
  return jwt.sign({ email: user.email, name: user.name }, config.jwt.secret, {
    subject: String(user.id),
    expiresIn: config.jwt.expiresIn,
  });
}

async function register(req, res) {
  const data = validateUser(req.body);

  if (await users.findByEmail(data.email)) {
    throw HttpError.conflict('El correo ya está registrado');
  }

  const passwordHash = await bcrypt.hash(data.password, config.bcryptRounds);
  const user = await users.create({ name: data.name, email: data.email, passwordHash });
  res.status(201).json({ user });
}

async function login(req, res) {
  const { email, password } = validateLogin(req.body);
  const user = await users.findByEmail(email, { withPassword: true });

  // Mismo mensaje para correo inexistente o contraseña incorrecta (no revelar qué falla).
  const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!valid) {
    throw HttpError.unauthorized('Credenciales inválidas');
  }

  const publicUser = users.toPublic(user);
  res.status(200).json({ token: signToken(publicUser), user: publicUser });
}

async function me(req, res) {
  const user = await users.findById(req.user.id);
  if (!user) throw HttpError.unauthorized('El usuario de la sesión ya no existe');
  res.json({ user });
}

module.exports = { register, login, me };
