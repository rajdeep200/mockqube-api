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
import { InterviewMessageModel } from '../src/models/interview-message.model.js';
import { InterviewSessionModel } from '../src/models/interview-session.model.js';
import { ensureKickoffMessageForSession, shouldGenerateKickoff } from '../src/modules/interviews/interview-kickoff.service.js';
import * as interviewerService from '../src/services/openai/interviewer.service.js';

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

test('unit: created -> in_progress with empty conversation creates one kickoff and is idempotent', async (t) => {
  const session = {
    _id: 'session-1',
    status: 'in_progress',
    company: 'MockQube',
    difficulty: 'medium',
    duration: 30,
    role: 'Backend Engineer'
  } as unknown as Parameters<typeof ensureKickoffMessageForSession>[0];

  const messages: Array<{ _id: string; sessionId: string; speaker: string; text: string; isKickoff?: boolean }> = [];

  t.mock.method(InterviewMessageModel, 'findOne', async (query: any) => {
    if (query?.isKickoff === true) {
      return messages.find((m) => m.sessionId === query.sessionId && m.isKickoff) ?? null;
    }
    return messages.find((m) => m.sessionId === query.sessionId) ?? null;
  });

  let createCalls = 0;
  t.mock.method(InterviewMessageModel, 'create', async (payload: any) => {
    createCalls += 1;
    const doc = { _id: `msg-${createCalls}`, ...payload };
    messages.push(doc);
    return doc as any;
  });

  t.mock.method(InterviewSessionModel, 'updateOne', async () => ({ acknowledged: true }) as any);
  t.mock.method(interviewerService, 'generateInterviewerReply', async () => ({
    nextQuestion: 'Explain eventual consistency.',
    followUpHint: 'Mention trade-offs.',
    communicationNote: 'clear'
  }));

  assert.equal(shouldGenerateKickoff('created', 'in_progress'), true);

  await ensureKickoffMessageForSession(session);
  await ensureKickoffMessageForSession(session);

  assert.equal(createCalls, 1);
  assert.equal(messages[0]?.speaker, 'ai');
  assert.equal(messages[0]?.isKickoff, true);
});

test('integration: PATCH to in_progress then GET messages returns kickoff', async (t) => {
  const app = await getApp();
  const bearer = authHeader();
  const userId = '507f1f77bcf86cd799439011';
  const sessionId = '64f0b8b7f0a4c8f9d4c12345';

  const sessionState = {
    _id: sessionId,
    userId,
    company: 'MockQube',
    difficulty: 'medium',
    duration: 45,
    role: 'Backend Engineer',
    status: 'created'
  };
  const messages: any[] = [];

  t.mock.method(InterviewSessionModel, 'findOne', async (query: any) => {
    if (String(query?._id) !== sessionId || query?.userId !== userId) return null;
    return { ...sessionState } as any;
  });

  t.mock.method(InterviewSessionModel, 'findOneAndUpdate', async (query: any, update: any) => {
    if (String(query?._id) !== sessionId || query?.userId !== userId) return null;
    Object.assign(sessionState, update.$set ?? {});
    return { ...sessionState } as any;
  });

  t.mock.method(InterviewSessionModel, 'updateOne', async () => ({ acknowledged: true }) as any);

  t.mock.method(InterviewMessageModel, 'findOne', async (query: any) => {
    if (query?.isKickoff === true) return messages.find((m) => m.isKickoff) ?? null;
    return messages.find((m) => m.sessionId === String(query?.sessionId)) ?? null;
  });

  t.mock.method(InterviewMessageModel, 'find', (query: any) => ({
    sort: async () => messages.filter((m) => m.sessionId === String(query?.sessionId))
  }) as any);

  t.mock.method(InterviewMessageModel, 'create', async (payload: any) => {
    const doc = {
      _id: `msg-${messages.length + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...payload
    };
    messages.push(doc);
    return doc as any;
  });

  t.mock.method(interviewerService, 'generateInterviewerReply', async () => ({
    nextQuestion: 'What is a mutex?',
    followUpHint: 'Compare with semaphore.',
    communicationNote: 'good'
  }));

  const patchResponse = await request(app)
    .patch(`/v1/interview-sessions/${sessionId}`)
    .set('Authorization', bearer)
    .send({ status: 'in_progress' });

  assert.equal(patchResponse.status, 200);

  const listResponse = await request(app)
    .get(`/v1/interview-sessions/${sessionId}/messages`)
    .set('Authorization', bearer);

  assert.equal(listResponse.status, 200);
  assert.equal(Array.isArray(listResponse.body.data), true);
  assert.equal(listResponse.body.data.length, 1);
  assert.equal(listResponse.body.data[0].speaker, 'ai');
});

test('regression: POST user message flow still stores user and ai messages', async (t) => {
  const app = await getApp();
  const bearer = authHeader();
  const userId = '507f1f77bcf86cd799439011';
  const sessionId = '64f0b8b7f0a4c8f9d4c99999';

  const sessionState = {
    _id: sessionId,
    userId,
    company: 'MockQube',
    difficulty: 'medium',
    duration: 45,
    role: 'Backend Engineer',
    status: 'in_progress'
  };
  const messages: any[] = [];

  t.mock.method(InterviewSessionModel, 'findOne', async (query: any) => {
    if (String(query?._id) !== sessionId || query?.userId !== userId) return null;
    return { ...sessionState } as any;
  });

  t.mock.method(InterviewMessageModel, 'find', (query: any) => ({
    sort: async () => messages.filter((m) => m.sessionId === String(query?.sessionId))
  }) as any);

  t.mock.method(InterviewMessageModel, 'create', async (payload: any) => {
    const doc = { _id: `msg-${messages.length + 1}`, ...payload };
    messages.push(doc);
    return doc as any;
  });

  t.mock.method(interviewerService, 'generateInterviewerReply', async () => ({
    nextQuestion: 'How would you optimize this query?',
    followUpHint: 'Think indexes.',
    communicationNote: 'nice'
  }));

  const response = await request(app)
    .post(`/v1/interview-sessions/${sessionId}/messages`)
    .set('Authorization', bearer)
    .send({ text: 'I would start by indexing' });

  assert.equal(response.status, 201);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].speaker, 'user');
  assert.equal(messages[1].speaker, 'ai');
});
