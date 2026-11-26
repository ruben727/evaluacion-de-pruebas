'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db/pool');
const { migrate } = require('../src/db/migrate');

const app = createApp();

async function resetDatabase() {
  await migrate();
  await pool.query('TRUNCATE TABLE users RESTART IDENTITY');
}

async function closeDatabase() {
  await pool.end();
}

const defaultUser = {
  name: 'Usuario Prueba',
  email: 'prueba@example.com',
  password: 'secreto123',
};

async function registerUser(overrides = {}) {
  const user = { ...defaultUser, ...overrides };
  const res = await request(app).post('/api/auth/register').send(user);
  return { res, user };
}

/** Registra un usuario, inicia sesión y devuelve su token. */
async function getAuthToken(overrides = {}) {
  const { user } = await registerUser(overrides);
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
  return res.body.token;
}

module.exports = { app, request, resetDatabase, closeDatabase, registerUser, getAuthToken, defaultUser, pool };
