'use strict';

const jwt = require('jsonwebtoken');
const { app, request, resetDatabase, closeDatabase, registerUser, defaultUser, pool } = require('./helpers');

beforeEach(resetDatabase);
afterAll(closeDatabase);

describe('POST /api/auth/register', () => {
  it('registra un usuario nuevo (201) sin devolver la contraseña', async () => {
    const { res } = await registerUser();

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ id: expect.any(Number), name: defaultUser.name, email: defaultUser.email });
    expect(res.body.user).not.toHaveProperty('password');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('guarda la contraseña encriptada con bcrypt', async () => {
    await registerUser();
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE email = $1', [defaultUser.email]);

    expect(rows[0].password_hash).not.toBe(defaultUser.password);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
  });

  it('normaliza el correo a minúsculas', async () => {
    const { res } = await registerUser({ email: '  MAYUS@Example.COM ' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('mayus@example.com');
  });

  it('rechaza un correo ya registrado (409), sin distinguir mayúsculas', async () => {
    await registerUser();
    const { res } = await registerUser({ email: defaultUser.email.toUpperCase() });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/ya está registrado/);
  });

  it.each([
    ['sin nombre', { name: '' }, 'name'],
    ['correo inválido', { email: 'no-es-correo' }, 'email'],
    ['contraseña corta', { password: '123' }, 'password'],
  ])('valida los campos: %s (400)', async (_caso, override, campo) => {
    const { res } = await registerUser(override);

    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty(campo);
  });

  it('rechaza un body vacío (400)', async () => {
    const res = await request(app).post('/api/auth/register').send({});
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('rechaza JSON mal formado (400)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"name": "roto"');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => registerUser());

  it('inicia sesión con credenciales correctas y devuelve un JWT (200)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: defaultUser.email, password: defaultUser.password });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(defaultUser.email);

    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(payload.sub).toBe(String(res.body.user.id));
    expect(payload.email).toBe(defaultUser.email);
  });

  it('rechaza una contraseña incorrecta (401)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: defaultUser.email, password: 'incorrecta' });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Credenciales inválidas');
    expect(res.body).not.toHaveProperty('token');
  });

  it('rechaza un correo inexistente con el mismo mensaje (401)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nadie@example.com', password: defaultUser.password });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Credenciales inválidas');
  });

  it('exige correo y contraseña (400)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: defaultUser.email });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty('password');
  });
});

describe('GET /api/auth/me', () => {
  it('devuelve el usuario de la sesión con un token válido', async () => {
    await registerUser();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: defaultUser.email, password: defaultUser.password });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(defaultUser.email);
  });
});
