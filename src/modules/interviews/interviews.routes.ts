import { Router } from 'express';
import { Types } from 'mongoose';
import { ApiError } from '../../common/api-error.js';
import { authRequired, type AuthenticatedRequest } from '../../middleware/auth.js';
import { CodeSubmissionModel } from '../../models/code-submission.model.js';
import { FeedbackReportModel } from '../../models/feedback-report.model.js';
import { InterviewMessageModel } from '../../models/interview-message.model.js';
import { InterviewSessionModel } from '../../models/interview-session.model.js';
import { generateEvaluationReport, generateInterviewerReply } from '../../services/openai/interviewer.service.js';
import { aiRateLimit } from '../../middleware/rate-limit.js';
import { createCodeSubmissionSchema, createMessageSchema, createSessionSchema, patchSessionSchema } from './interviews.schema.js';
import { ensureKickoffMessageForSession, shouldGenerateKickoff } from './interview-kickoff.service.js';

const router = Router();
router.use(authRequired);

function parsePaging(query: { page?: unknown; pageSize?: unknown }): { page: number; pageSize: number } {
  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 10)));
  return { page, pageSize };
}

async function getOwnedSession(req: AuthenticatedRequest, id?: string) {
  if (!id) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Session id is required.');
  }
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid session id.');
  }

  const session = await InterviewSessionModel.findOne({ _id: id, userId: req.user!.sub });
  if (!session) throw new ApiError(404, 'NOT_FOUND', 'Interview session not found.');
  return session;
}

/**
 * @openapi
 * /v1/interview-sessions:
 *   post:
 *     tags: [Interview Sessions]
 *     security: [{ bearerAuth: [] }]
 *     summary: Create interview session
 */
router.post('/', async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const payload = createSessionSchema.parse(req.body);
  const userId = authReq.user!.sub;

  const session = await InterviewSessionModel.create({
    userId,
    company: payload.company,
    difficulty: payload.difficulty,
    duration: payload.duration,
    role: payload.role ?? null,
    status: 'created'
  });

  return res.status(201).json({
    id: String(session._id),
    userId: String(session.userId),
    company: session.company,
    difficulty: session.difficulty,
    duration: session.duration,
    role: session.role,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  });
});

/**
 * @openapi
 * /v1/interview-sessions:
 *   get:
 *     tags: [Interview Sessions]
 *     security: [{ bearerAuth: [] }]
 *     summary: List interview sessions
 */
router.get('/', async (req, res) => {
  const userId = (req as AuthenticatedRequest).user!.sub;
  const { page, pageSize } = parsePaging({ page: req.query.page, pageSize: req.query.pageSize });
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  const filter: Record<string, unknown> = { userId };
  if (status) filter.status = status;

  const total = await InterviewSessionModel.countDocuments(filter);
  const records = await InterviewSessionModel.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize);

  return res.status(200).json({
    data: records.map((s) => ({
      id: String(s._id),
      company: s.company,
      difficulty: s.difficulty,
      duration: s.duration,
      role: s.role,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString()
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  });
});

/**
 * @openapi
 * /v1/interview-sessions/{id}:
 *   get:
 *     tags: [Interview Sessions]
 *     security: [{ bearerAuth: [] }]
 *     summary: Get interview session detail
 */
router.get('/:id', async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const session = await getOwnedSession(authReq, req.params.id);

  return res.status(200).json(session);
});

/**
 * @openapi
 * /v1/interview-sessions/{id}:
 *   patch:
 *     tags: [Interview Sessions]
 *     security: [{ bearerAuth: [] }]
 *     summary: Update interview session status
 */
router.patch('/:id', async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const payload = patchSessionSchema.parse(req.body);
  if (!Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid session id.');
  }

  const previousSession = await InterviewSessionModel.findOne({ _id: req.params.id, userId: authReq.user!.sub });
  if (!previousSession) throw new ApiError(404, 'NOT_FOUND', 'Interview session not found.');

  const session = await InterviewSessionModel.findOneAndUpdate(
    { _id: req.params.id, userId: authReq.user!.sub },
    { $set: payload },
    { new: true }
  );

  if (!session) throw new ApiError(404, 'NOT_FOUND', 'Interview session not found.');

  if (shouldGenerateKickoff(previousSession.status, payload.status)) {
    await ensureKickoffMessageForSession(session);
  }

  return res.status(200).json(session);
});

/**
 * @openapi
 * /v1/interview-sessions/{id}/messages:
 *   post:
 *     tags: [Interview Messages]
 *     security: [{ bearerAuth: [] }]
 *     summary: Post user message and get AI follow-up
 */
router.post('/:id/messages', aiRateLimit, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const payload = createMessageSchema.parse(req.body);

  const session = await getOwnedSession(authReq, req.params.id);

  const userMessage = await InterviewMessageModel.create({ sessionId: session._id, speaker: 'user', text: payload.text });

  const transcriptDocs = await InterviewMessageModel.find({ sessionId: session._id }).sort({ createdAt: 1 });
  const transcript = transcriptDocs.map((m) => ({ speaker: m.speaker as 'ai' | 'user', text: m.text }));

  const aiReply = await generateInterviewerReply({
    company: session.company,
    difficulty: session.difficulty,
    duration: session.duration,
    role: session.role,
    transcript
  });

  const aiMessage = await InterviewMessageModel.create({
    sessionId: session._id,
    speaker: 'ai',
    text: `${aiReply.nextQuestion}\nHint: ${aiReply.followUpHint}`
  });

  return res.status(201).json({
    userMessage,
    aiMessage,
    meta: { communicationNote: aiReply.communicationNote }
  });
});

/**
 * @openapi
 * /v1/interview-sessions/{id}/messages:
 *   get:
 *     tags: [Interview Messages]
 *     security: [{ bearerAuth: [] }]
 *     summary: List messages for a session
 */
router.get('/:id/messages', async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const session = await getOwnedSession(authReq, req.params.id);

  const messages = await InterviewMessageModel.find({ sessionId: session._id }).sort({ createdAt: 1 });
  return res.status(200).json({ data: messages });
});

/**
 * @openapi
 * /v1/interview-sessions/{id}/code-submissions:
 *   post:
 *     tags: [Code Submissions]
 *     security: [{ bearerAuth: [] }]
 *     summary: Submit code for a session
 */
router.post('/:id/code-submissions', async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const payload = createCodeSubmissionSchema.parse(req.body);
  const session = await getOwnedSession(authReq, req.params.id);

  const submission = await CodeSubmissionModel.create({
    sessionId: session._id,
    code: payload.code,
    language: payload.language,
    evaluation: null
  });

  return res.status(201).json(submission);
});

/**
 * @openapi
 * /v1/interview-sessions/{id}/report:
 *   get:
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     summary: Get or generate interview feedback report
 */
router.get('/:id/report', aiRateLimit, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const session = await getOwnedSession(authReq, req.params.id);

  let report = await FeedbackReportModel.findOne({ sessionId: session._id });
  if (!report) {
    const transcriptDocs = await InterviewMessageModel.find({ sessionId: session._id }).sort({ createdAt: 1 });
    const codeDocs = await CodeSubmissionModel.find({ sessionId: session._id }).sort({ createdAt: 1 });

    const aiReport = await generateEvaluationReport({
      transcript: transcriptDocs.map((m) => ({ speaker: m.speaker as 'ai' | 'user', text: m.text })),
      codeSubmissions: codeDocs.map((c) => ({ language: c.language, code: c.code }))
    });

    report = await FeedbackReportModel.create({
      sessionId: session._id,
      feedbackSummary: aiReport.feedbackSummary,
      solutionOverview: aiReport.solutionOverview,
      recommendations: aiReport.recommendations,
      scores: aiReport.scores
    });
  }

  return res.status(200).json(report);
});

export const interviewsRouter = router;
