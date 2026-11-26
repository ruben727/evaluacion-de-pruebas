'use strict';

const bcrypt = require('bcryptjs');
const config = require('../config');
const HttpError = require('../utils/HttpError');
const { validateUser, parseId } = require('../utils/validators');
const users = require('../db/users.repository');

async function list(_req, res) {
  res.json({ users: await users.findAll() });
}

async function getById(req, res) {
  const user = await users.findById(parseId(req.params.id));
  if (!user) throw HttpError.notFound('Usuario no encontrado');
  res.json({ user });
}

async function create(req, res) {
  const data = validateUser(req.body);
  if (await users.findByEmail(data.email)) {
    throw HttpError.conflict('El correo ya está registrado');
  }
  const passwordHash = await bcrypt.hash(data.password, config.bcryptRounds);
  const user = await users.create({ name: data.name, email: data.email, passwordHash });
  res.status(201).json({ user });
}

async function update(req, res) {
  const id = parseId(req.params.id);
  const data = validateUser(req.body, { partial: true });

  if (Object.keys(data).length === 0) {
    throw HttpError.badRequest('Debe enviar al menos un campo: name, email o password');
  }

  if (!(await users.findById(id))) throw HttpError.notFound('Usuario no encontrado');

  if (data.email) {
    const other = await users.findByEmail(data.email);
    if (other && other.id !== id) throw HttpError.conflict('El correo ya está registrado');
  }

  const passwordHash = data.password ? await bcrypt.hash(data.password, config.bcryptRounds) : undefined;
  const user = await users.update(id, { name: data.name, email: data.email, passwordHash });
  res.json({ user });
}

async function remove(req, res) {
  const id = parseId(req.params.id);
  const deleted = await users.remove(id);
  if (!deleted) throw HttpError.notFound('Usuario no encontrado');
  res.status(200).json({ message: 'Usuario eliminado', id });
}

module.exports = { list, getById, create, update, remove };
