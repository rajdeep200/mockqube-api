import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/mockqube-test';
process.env.FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
process.env.API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'this-is-a-very-secret-test-key';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'test-openai-key';

let appPromise: Promise<import('express').Express> | null = null;
async function getApp() {
  if (!appPromise) {
    appPromise = import('../src/app.js').then((m) => m.default);
  }
  return appPromise;
}

test('GET /health returns ok payload', async () => {
  const app = await getApp();
  const response = await request(app).get('/health');

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.match(response.body.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test('auth endpoints are registered (non-404)', async () => {
  const app = await getApp();
  const signup = await request(app).options('/v1/auth/signup');
  const login = await request(app).options('/v1/auth/login');
  const forgot = await request(app).options('/v1/auth/forgot-password');
  const reset = await request(app).options('/v1/auth/reset-password');

  assert.notEqual(signup.status, 404);
  assert.notEqual(login.status, 404);
  assert.notEqual(forgot.status, 404);
  assert.notEqual(reset.status, 404);
});

test('protected interview endpoints require auth (non-404 + 401)', async () => {
  const app = await getApp();
  const id = '64f0b8b7f0a4c8f9d4c12345';
  const responses = await Promise.all([
    request(app).post('/v1/interview-sessions').send({}),
    request(app).get('/v1/interview-sessions'),
    request(app).get(`/v1/interview-sessions/${id}`),
    request(app).patch(`/v1/interview-sessions/${id}`).send({}),
    request(app).post(`/v1/interview-sessions/${id}/messages`).send({}),
    request(app).get(`/v1/interview-sessions/${id}/messages`),
    request(app).post(`/v1/interview-sessions/${id}/code-submissions`).send({}),
    request(app).get(`/v1/interview-sessions/${id}/report`),
    request(app).get('/v1/dashboard/summary')
  ]);

  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'UNAUTHORIZED');
  }
});
