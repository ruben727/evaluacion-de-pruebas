'use strict';

const { app, request, closeDatabase, pool } = require('./helpers');

afterAll(closeDatabase);

describe('GET /api/health', () => {
  it('informa que la API y la BD están arriba (200)', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      api: { status: 'up' },
      database: { status: 'up' },
    });
    expect(res.body.database.latencyMs).toEqual(expect.any(Number));
    expect(res.body.api.commit).toEqual(expect.any(String));
  });

  it('expone el commit desplegado (APP_COMMIT)', async () => {
    process.env.APP_COMMIT = 'abc123';
    const res = await request(app).get('/api/health');
    delete process.env.APP_COMMIT;
    expect(res.body.api.commit).toBe('abc123');
  });

  it('responde 503 si la BD no responde', async () => {
    const spy = jest.spyOn(pool, 'query').mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app).get('/api/health');
    spy.mockRestore();

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', database: { status: 'down' } });
  });
});

describe('Rutas y errores', () => {
  it('devuelve 404 en JSON para rutas desconocidas', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.status).toBe(404);
  });

  it('devuelve 500 genérico ante un error inesperado, sin filtrar detalles', async () => {
    const spy = jest.spyOn(pool, 'query').mockRejectedValueOnce(new Error('detalle interno secreto'));
    const res = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'x' });
    spy.mockRestore();

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('Error interno del servidor');
    expect(JSON.stringify(res.body)).not.toMatch(/secreto/);
  });
});
