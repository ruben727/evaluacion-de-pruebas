'use strict';

const jwt = require('jsonwebtoken');
const { app, request, resetDatabase, closeDatabase, getAuthToken } = require('./helpers');

let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

const nuevo = { name: 'Ana Pérez', email: 'ana@example.com', password: 'clave1234' };

async function crearUsuario(data = nuevo) {
  return request(app).post('/api/users').set(auth()).send(data);
}

beforeEach(async () => {
  await resetDatabase();
  token = await getAuthToken({ email: 'sesion@example.com' });
});
afterAll(closeDatabase);

describe('Protección con JWT (401)', () => {
  it.each([
    ['get', '/api/users'],
    ['get', '/api/users/1'],
    ['post', '/api/users'],
    ['put', '/api/users/1'],
    ['delete', '/api/users/1'],
  ])('%s %s sin token responde 401', async (method, url) => {
    const res = await request(app)[method](url).send({});
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/Token/);
  });

  it('rechaza un token con firma inválida (401)', async () => {
    const falso = jwt.sign({ email: 'x@example.com' }, 'otro-secreto', { subject: '1' });
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${falso}`);
    expect(res.status).toBe(401);
  });

  it('rechaza un token expirado (401)', async () => {
    const expirado = jwt.sign({ email: 'x@example.com' }, process.env.JWT_SECRET, { subject: '1', expiresIn: -10 });
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${expirado}`);
    expect(res.status).toBe(401);
  });

  it('rechaza un esquema distinto de Bearer (401)', async () => {
    const res = await request(app).get('/api/users').set('Authorization', `Basic ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/users', () => {
  it('lista los usuarios (200) sin exponer contraseñas', async () => {
    await crearUsuario();
    const res = await request(app).get('/api/users').set(auth());

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    expect(res.body.users.map((u) => u.email)).toEqual(['sesion@example.com', 'ana@example.com']);
    res.body.users.forEach((u) => expect(u).not.toHaveProperty('password_hash'));
  });
});

describe('GET /api/users/:id', () => {
  it('devuelve un usuario existente (200)', async () => {
    const creado = await crearUsuario();
    const res = await request(app).get(`/api/users/${creado.body.user.id}`).set(auth());

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: nuevo.name, email: nuevo.email });
  });

  it('responde 404 si no existe', async () => {
    const res = await request(app).get('/api/users/9999').set(auth());
    expect(res.status).toBe(404);
  });

  it('responde 400 con un id no numérico', async () => {
    const res = await request(app).get('/api/users/abc').set(auth());
    expect(res.status).toBe(400);
  });
});

describe('POST /api/users', () => {
  it('crea un usuario (201)', async () => {
    const res = await crearUsuario();

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ id: expect.any(Number), name: nuevo.name, email: nuevo.email });
  });

  it('el usuario creado puede iniciar sesión', async () => {
    await crearUsuario();
    const res = await request(app).post('/api/auth/login').send({ email: nuevo.email, password: nuevo.password });
    expect(res.status).toBe(200);
  });

  it('valida los datos (400)', async () => {
    const res = await crearUsuario({ name: 'A', email: 'mal', password: '1' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details).sort()).toEqual(['email', 'name', 'password']);
  });

  it('rechaza correos duplicados (409)', async () => {
    await crearUsuario();
    const res = await crearUsuario();
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/users/:id', () => {
  it('actualiza nombre y correo (200)', async () => {
    const { body } = await crearUsuario();
    const res = await request(app)
      .put(`/api/users/${body.user.id}`)
      .set(auth())
      .send({ name: 'Ana Editada', email: 'ana.editada@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: body.user.id, name: 'Ana Editada', email: 'ana.editada@example.com' });
  });

  it('permite actualizar solo la contraseña', async () => {
    const { body } = await crearUsuario();
    const res = await request(app).put(`/api/users/${body.user.id}`).set(auth()).send({ password: 'nuevaClave99' });
    expect(res.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: nuevo.email, password: 'nuevaClave99' });
    expect(login.status).toBe(200);
  });

  it('responde 404 si el usuario no existe', async () => {
    const res = await request(app).put('/api/users/9999').set(auth()).send({ name: 'Nadie Nadie' });
    expect(res.status).toBe(404);
  });

  it('responde 400 si no se envía ningún campo', async () => {
    const { body } = await crearUsuario();
    const res = await request(app).put(`/api/users/${body.user.id}`).set(auth()).send({});
    expect(res.status).toBe(400);
  });

  it('responde 400 con datos inválidos', async () => {
    const { body } = await crearUsuario();
    const res = await request(app).put(`/api/users/${body.user.id}`).set(auth()).send({ email: 'no-valido' });
    expect(res.status).toBe(400);
  });

  it('responde 409 si el correo pertenece a otro usuario', async () => {
    const { body } = await crearUsuario();
    const res = await request(app)
      .put(`/api/users/${body.user.id}`)
      .set(auth())
      .send({ email: 'sesion@example.com' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/users/:id', () => {
  it('elimina un usuario (200) y deja de existir', async () => {
    const { body } = await crearUsuario();
    const res = await request(app).delete(`/api/users/${body.user.id}`).set(auth());

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(body.user.id);

    const get = await request(app).get(`/api/users/${body.user.id}`).set(auth());
    expect(get.status).toBe(404);
  });

  it('responde 404 si el usuario no existe', async () => {
    const res = await request(app).delete('/api/users/9999').set(auth());
    expect(res.status).toBe(404);
  });
});
