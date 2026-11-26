import { expect, test } from '@playwright/test';

test('GET /api/health a través de nginx responde ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ status: 'ok', api: { status: 'up' }, database: { status: 'up' } });
});
