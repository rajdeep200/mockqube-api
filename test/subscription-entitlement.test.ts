import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/mockqube-test';
process.env.FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
process.env.API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'this-is-a-very-secret-test-key';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'test-openai-key';

import { signAccessToken } from '../src/middleware/auth.js';
import { FeedbackReportModel } from '../src/models/feedback-report.model.js';
import { InterviewSessionModel } from '../src/models/interview-session.model.js';
import { UserModel } from '../src/models/user.model.js';
import { ContactMessageModel } from '../src/models/contact-message.model.js';
import { resolveEntitlements } from '../src/services/subscription/entitlement.service.js';

let appPromise: Promise<import('express').Express> | null = null;
async function getApp() {
  if (!appPromise) {
    appPromise = import('../src/app.js').then((m) => m.default);
  }
  return appPromise;
}

function authHeader(userId = '507f1f77bcf86cd799439011') {
  const token = signAccessToken({ sub: userId, email: 'test@example.com', name: 'Tester' });
  return `Bearer ${token}`;
}

test('unit: basic plan resolves to single primary track entitlement', () => {
  const entitlements = resolveEntitlements({
    _id: '507f1f77bcf86cd799439011',
    subscriptionPlan: 'basic',
    primaryDsaTrack: 'graph'
  });

  assert.deepEqual(entitlements.allowedTracks, ['graph']);
  assert.equal(entitlements.interviewsPerMonth, 3);
  assert.equal(entitlements.feedbackTier, 'summary');
});

test('integration: blocks session creation when plan quota is reached', async (t) => {
  const app = await getApp();
  const bearer = authHeader();

  t.mock.method(UserModel, 'findById', () => ({
    select: async () => ({ _id: '507f1f77bcf86cd799439011', subscriptionPlan: 'basic', subscriptionStatus: 'active', primaryDsaTrack: 'arrays' })
  }) as any);
  t.mock.method(InterviewSessionModel, 'countDocuments', async () => 3 as never);

  const response = await request(app)
    .post('/v1/interview-sessions')
    .set('Authorization', bearer)
    .send({ company: 'MockQube', difficulty: 'medium', duration: 45, track: 'arrays', mode: 'mixed' });

  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'PLAN_LIMIT_REACHED');
});

test('integration: blocks disallowed track/mode for basic plan', async (t) => {
  const app = await getApp();
  const bearer = authHeader();

  t.mock.method(UserModel, 'findById', () => ({
    select: async () => ({ _id: '507f1f77bcf86cd799439011', subscriptionPlan: 'basic', subscriptionStatus: 'active', primaryDsaTrack: 'arrays' })
  }) as any);
  t.mock.method(InterviewSessionModel, 'countDocuments', async () => 0 as never);

  const response = await request(app)
    .post('/v1/interview-sessions')
    .set('Authorization', bearer)
    .send({ company: 'MockQube', difficulty: 'medium', duration: 45, track: 'graph', mode: 'company_tagged' });

  assert.equal(response.status, 403);
  assert.ok(['TRACK_NOT_ALLOWED', 'MODE_NOT_ALLOWED'].includes(response.body.code));
});

test('integration: subscription status endpoint returns plan and usage', async (t) => {
  const app = await getApp();
  const bearer = authHeader();

  t.mock.method(UserModel, 'findById', () => ({
    select: async () => ({
      _id: '507f1f77bcf86cd799439011',
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
      primaryDsaTrack: 'arrays',
      subscriptionStartedAt: null,
      subscriptionEndsAt: null
    })
  }) as any);
  t.mock.method(InterviewSessionModel, 'countDocuments', async () => 4 as never);

  const response = await request(app).get('/v1/subscription/me').set('Authorization', bearer);

  assert.equal(response.status, 200);
  assert.equal(response.body.plan, 'pro');
  assert.equal(response.body.usageThisMonth, 4);
  assert.equal(response.body.remainingInterviewCount, 16);
});

test('integration: basic user cannot access performance endpoint', async (t) => {
  const app = await getApp();
  const bearer = authHeader();

  t.mock.method(UserModel, 'findById', () => ({
    select: async () => ({ _id: '507f1f77bcf86cd799439011', subscriptionPlan: 'basic', subscriptionStatus: 'active', primaryDsaTrack: 'arrays' })
  }) as any);

  const response = await request(app).get('/v1/performance/me').set('Authorization', bearer);

  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'PLAN_RESTRICTED');
});

test('integration: basic report history is restricted to latest 3', async (t) => {
  const app = await getApp();
  const bearer = authHeader();
  const sessionId = '64f0b8b7f0a4c8f9d4c12345';

  t.mock.method(UserModel, 'findById', () => ({
    select: async () => ({ _id: '507f1f77bcf86cd799439011', subscriptionPlan: 'basic', subscriptionStatus: 'active', primaryDsaTrack: 'arrays' })
  }) as any);

  t.mock.method(InterviewSessionModel, 'findOne', async () => ({
    _id: sessionId,
    userId: '507f1f77bcf86cd799439011',
    company: 'MockQube',
    difficulty: 'medium',
    duration: 30,
    status: 'completed'
  }) as any);

  t.mock.method(FeedbackReportModel, 'findOne', async () => ({
    _id: 'report1',
    sessionId,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    toObject: () => ({
      feedbackSummary: 'x',
      solutionOverview: 'y',
      recommendations: ['a', 'b', 'c'],
      scores: { accuracy: 60, efficiency: 60, communication: 60, problemSolving: 60 }
    })
  }) as any);

  t.mock.method(FeedbackReportModel, 'aggregate', async () => [{ count: 5 }] as never);

  const response = await request(app).get(`/v1/interview-sessions/${sessionId}/report`).set('Authorization', bearer);
  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'PLAN_RESTRICTED_REPORT_HISTORY');
});

test('integration: contact message stores support tier based on user plan', async (t) => {
  const app = await getApp();

  t.mock.method(ContactMessageModel, 'countDocuments', async () => 0 as never);
  t.mock.method(ContactMessageModel, 'findOne', (() => ({ select: async () => null })) as never);

  let createdPayload: Record<string, unknown> = {};
  t.mock.method(ContactMessageModel, 'create', async (payload: Record<string, unknown>) => {
    createdPayload = payload;
    return { _id: 'contact1', createdAt: new Date() } as never;
  });

  t.mock.method(UserModel, 'findOne', () => ({
    select: async () => ({ _id: '507f1f77bcf86cd799439011', subscriptionPlan: 'premium', subscriptionStatus: 'active' })
  }) as any);

  const response = await request(app).post('/v1/contact/messages').send({
    name: 'Jane Doe',
    email: 'jane@example.com',
    message: 'Need help understanding my premium-only insights view.'
  });

  assert.equal(response.status, 201);
  assert.equal(createdPayload.sourcePlan, 'premium');
  assert.equal(createdPayload.supportTier, 'fastest');
});
