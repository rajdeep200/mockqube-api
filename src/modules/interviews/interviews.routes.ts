import { Router } from 'express';
import { Types } from 'mongoose';
import { ApiError } from '../../common/api-error.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authRequired, type AuthenticatedRequest } from '../../middleware/auth.js';
import { CodeSubmissionModel } from '../../models/code-submission.model.js';
import { FeedbackReportModel } from '../../models/feedback-report.model.js';
import { InterviewMessageModel } from '../../models/interview-message.model.js';
import { InterviewSessionModel } from '../../models/interview-session.model.js';
import { UserModel } from '../../models/user.model.js';
import {
  formatAiInterviewerMessage,
  generateEvaluationReport,
  generateInterviewerReply
} from '../../services/openai/interviewer.service.js';
import { aiRateLimit } from '../../middleware/rate-limit.js';
import { createCodeSubmissionSchema, createMessageSchema, createSessionSchema, patchSessionSchema } from './interviews.schema.js';
import { ensureKickoffMessageForSession, shouldGenerateKickoff } from './interview-kickoff.service.js';
import {
  canCreateInterview,
  isModeAllowed,
  isReportVisibleToPlan,
  isTrackAllowed,
  resolveEntitlements,
  shapeReportByPlan
} from '../../services/subscription/entitlement.service.js';
import { DEFAULT_INTERVIEW_MODE } from '../../config/subscription-plans.js';

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

async function getCurrentUser(req: AuthenticatedRequest) {
  const user = await UserModel.findById(req.user!.sub).select({
    subscriptionPlan: 1,
    subscriptionStatus: 1,
    primaryDsaTrack: 1,
    featureFlags: 1
  });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found.');
  return user;
}

router.post('/', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const payload = createSessionSchema.parse(req.body);
  const userId = authReq.user!.sub;
  const user = await getCurrentUser(authReq);

  const creation = await canCreateInterview(user);
  if (!creation.allowed) {
    if (creation.reason === 'SUBSCRIPTION_INACTIVE') {
      throw new ApiError(403, 'SUBSCRIPTION_INACTIVE', 'Your subscription is not active.');
    }
    throw new ApiError(403, 'PLAN_LIMIT_REACHED', 'Monthly interview quota reached for your plan.', {
      monthlyUsage: creation.usage,
      monthlyLimit: creation.limit
    });
  }

  if (!isTrackAllowed(user, payload.track)) {
    throw new ApiError(403, 'TRACK_NOT_ALLOWED', 'Requested track is not allowed for your plan.');
  }

  if (!isModeAllowed(user, payload.mode)) {
    throw new ApiError(403, 'MODE_NOT_ALLOWED', 'Requested interview mode is not allowed for your plan.');
  }

  const session = await InterviewSessionModel.create({
    userId,
    company: payload.company,
    difficulty: payload.difficulty,
    duration: payload.duration,
    role: payload.role ?? null,
    track: payload.track ?? null,
    mode: payload.mode ?? DEFAULT_INTERVIEW_MODE,
    status: 'created'
  });

  return res.status(201).json({
    id: String(session._id),
    userId: String(session.userId),
    company: session.company,
    difficulty: session.difficulty,
    duration: session.duration,
    role: session.role,
    track: session.track,
    mode: session.mode,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  });
}));

router.get('/', asyncHandler(async (req, res) => {
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
      track: s.track,
      mode: s.mode,
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
}));

router.get('/reports', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const user = await getCurrentUser(authReq);
  const entitlements = resolveEntitlements(user);

  const sessions = await InterviewSessionModel.find({ userId: authReq.user!.sub }).select({ _id: 1 }).sort({ createdAt: -1 });
  const sessionIds = sessions.map((s) => s._id);

  let query = FeedbackReportModel.find({ sessionId: { $in: sessionIds } }).sort({ createdAt: -1 });
  if (entitlements.maxVisibleReports !== null) {
    query = query.limit(entitlements.maxVisibleReports);
  }

  const reports = await query;

  return res.status(200).json({
    data: reports.map((report) => shapeReportByPlan(user, report.toObject()))
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const session = await getOwnedSession(authReq, req.params.id);

  return res.status(200).json(session);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
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
}));

router.post('/:id/messages', aiRateLimit, asyncHandler(async (req, res) => {
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
    text: formatAiInterviewerMessage(aiReply)
  });

  return res.status(201).json({
    userMessage,
    aiMessage,
    meta: { communicationNote: aiReply.communicationNote }
  });
}));

router.get('/:id/messages', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  let session = await getOwnedSession(authReq, req.params.id);

  if (session.status === 'created') {
    const promotedSession = await InterviewSessionModel.findOneAndUpdate(
      { _id: session._id, userId: authReq.user!.sub, status: 'created' },
      { $set: { status: 'in_progress' } },
      { new: true }
    );

    if (promotedSession) {
      session = promotedSession;
    }
  }

  await ensureKickoffMessageForSession(session);

  const messages = await InterviewMessageModel.find({ sessionId: session._id }).sort({ createdAt: 1 });
  return res.status(200).json({ data: messages });
}));

router.post('/:id/code-submissions', asyncHandler(async (req, res) => {
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
}));

router.get('/:id/report', aiRateLimit, asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const session = await getOwnedSession(authReq, req.params.id);
  const user = await getCurrentUser(authReq);

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

  const visible = await isReportVisibleToPlan(user, report.createdAt);
  if (!visible) {
    throw new ApiError(403, 'PLAN_RESTRICTED_REPORT_HISTORY', 'Report is outside your plan report history window.');
  }

  return res.status(200).json(shapeReportByPlan(user, report.toObject()));
}));

export const interviewsRouter = router;
