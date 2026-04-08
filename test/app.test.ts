import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { authRequired, type AuthenticatedRequest } from '../src/middleware/auth.js';

import { ContactMessageModel } from '../src/models/contact-message.model.js';

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

test('authRequired accepts passport session authentication when bearer token is missing', () => {
  const req = {
    headers: {},
    isAuthenticated: () => true,
    user: {
      id: '507f1f77bcf86cd799439011',
      email: 'session-user@example.com',
      name: 'Session User'
    }
  } as unknown as AuthenticatedRequest;

  let calledNext = false;
  authRequired(req, {} as never, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
  assert.equal(req.user?.sub, '507f1f77bcf86cd799439011');
  assert.equal(req.user?.email, 'session-user@example.com');
  assert.equal(req.user?.name, 'Session User');
});

test('POST /api/tts returns validation error for invalid payload', async () => {
  const app = await getApp();
  const response = await request(app).post('/api/tts').send({ sessionId: '', text: '' });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'VALIDATION_ERROR');
});

test('POST /api/tts returns provider error when AWS Polly is unconfigured', async () => {
  const app = await getApp();
  const response = await request(app)
    .post('/api/tts')
    .send({ sessionId: 'sess_123', text: 'Hello world', voiceProvider: 'aws-polly' });

  assert.equal(response.status, 502);
  assert.equal(response.body.code, 'AI_PROVIDER_ERROR');
});


test('contact endpoint returns validation payload for invalid body', async () => {
  const app = await getApp();
  const response = await request(app).post('/v1/contact/messages').send({ name: 'A', email: 'bad', message: 'short' });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'VALIDATION_ERROR');
  assert.equal(response.body.message, 'Invalid request payload');
  assert.ok(response.body.details.name);
  assert.ok(response.body.details.email);
  assert.ok(response.body.details.message);
});

test('contact endpoint stores message and returns expected success payload', async () => {
  const app = await getApp();

  const originalCountDocuments = ContactMessageModel.countDocuments;
  const originalFindOne = ContactMessageModel.findOne;
  const originalCreate = ContactMessageModel.create;

  ContactMessageModel.countDocuments = async () => 0 as never;
  ContactMessageModel.findOne = (() => ({
    select: async () => null
  })) as never;
  ContactMessageModel.create = async () => ({ _id: '507f1f77bcf86cd799439011', createdAt: new Date() }) as never;

  try {
    const response = await request(app).post('/v1/contact/messages').send({
      name: 'Jane Doe',
      email: 'jane@example.com',
      message: 'I would like to know more about MockQube enterprise pricing.'
    });

    assert.equal(response.status, 201);
    assert.deepEqual(response.body, {
      success: true,
      message: 'Your message has been received'
    });
  } finally {
    ContactMessageModel.countDocuments = originalCountDocuments;
    ContactMessageModel.findOne = originalFindOne;
    ContactMessageModel.create = originalCreate;
  }
});
