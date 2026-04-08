import { Router } from 'express';
import { Types } from 'mongoose';
import { ApiError } from '../../common/api-error.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authRequired, type AuthenticatedRequest } from '../../middleware/auth.js';
import { FeedbackReportModel } from '../../models/feedback-report.model.js';
import { InterviewSessionModel } from '../../models/interview-session.model.js';
import { UserModel } from '../../models/user.model.js';
import { resolveEntitlements } from '../../services/subscription/entitlement.service.js';

const router = Router();
router.use(authRequired);

router.get('/me', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const user = await UserModel.findById(authReq.user!.sub).select({ subscriptionPlan: 1, subscriptionStatus: 1, primaryDsaTrack: 1 });
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'User not found.');

  const entitlements = resolveEntitlements(user);
  if (entitlements.performanceWindowDays === null && (user.subscriptionPlan ?? 'basic') === 'basic') {
    throw new ApiError(403, 'PLAN_RESTRICTED', 'Performance analytics are available on Pro and Premium plans only.');
  }

  const dateFilter = entitlements.performanceWindowDays === null
    ? undefined
    : new Date(Date.now() - entitlements.performanceWindowDays * 24 * 60 * 60 * 1000);

  const sessionFilter: Record<string, unknown> = {
    userId: new Types.ObjectId(authReq.user!.sub),
    status: 'completed'
  };
  if (dateFilter) {
    sessionFilter.createdAt = { $gte: dateFilter };
  }

  const sessions = await InterviewSessionModel.find(sessionFilter).sort({ createdAt: -1 }).limit(200);
  const sessionIds = sessions.map((s) => s._id);
  const reports = await FeedbackReportModel.find({ sessionId: { $in: sessionIds } }).sort({ createdAt: -1 });

  const bySession = new Map(reports.map((r) => [String(r.sessionId), r]));
  const trend = sessions.map((session) => {
    const report = bySession.get(String(session._id));
    const values = report?.scores ? Object.values(report.scores) : [];
    const overall = values.length ? Math.round(values.reduce((acc, v) => acc + v, 0) / values.length) : 0;
    return {
      sessionId: String(session._id),
      createdAt: session.createdAt,
      overall,
      track: session.track ?? 'unknown'
    };
  }).reverse();

  const allScoreEntries = reports.flatMap((r) => Object.entries(r.scores ?? {}));
  const categoryBucket = allScoreEntries.reduce<Record<string, { sum: number; count: number }>>((acc, [k, v]) => {
    const existing = acc[k] ?? { sum: 0, count: 0 };
    existing.sum += v;
    existing.count += 1;
    acc[k] = existing;
    return acc;
  }, {});

  const averageCategoryScores = Object.fromEntries(
    Object.entries(categoryBucket).map(([k, v]) => [k, Math.round(v.sum / Math.max(1, v.count))])
  );

  const trackAttempts = sessions.reduce<Record<string, number>>((acc, session) => {
    const key = session.track ?? 'unassigned';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const areaRanking = Object.entries(averageCategoryScores).sort((a, b) => b[1] - a[1]);

  return res.status(200).json({
    totalCompletedSessions: sessions.length,
    trend,
    averageCategoryScores,
    trackAttempts,
    strongestArea: areaRanking[0]?.[0] ?? null,
    weakestRecurringArea: areaRanking[areaRanking.length - 1]?.[0] ?? null,
    recentActivity: sessions.slice(0, 10).map((s) => ({
      sessionId: String(s._id),
      createdAt: s.createdAt,
      company: s.company,
      difficulty: s.difficulty,
      track: s.track,
      mode: s.mode
    }))
  });
}));

export const performanceRouter = router;
