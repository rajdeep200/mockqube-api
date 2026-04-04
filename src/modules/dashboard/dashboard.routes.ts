import { Router } from 'express';
import { authRequired, type AuthenticatedRequest } from '../../middleware/auth.js';
import { FeedbackReportModel } from '../../models/feedback-report.model.js';
import { InterviewSessionModel } from '../../models/interview-session.model.js';

const router = Router();
router.use(authRequired);

/**
 * @openapi
 * /v1/dashboard/summary:
 *   get:
 *     tags: [Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     summary: Aggregate dashboard metrics for current user
 */
router.get('/summary', async (req, res) => {
  const userId = (req as AuthenticatedRequest).user!.sub;

  const sessions = await InterviewSessionModel.find({ userId }).sort({ createdAt: -1 });
  const completedIds = sessions.filter((s) => s.status === 'completed').map((s) => s._id);
  const reports = await FeedbackReportModel.find({ sessionId: { $in: completedIds } });

  const scoreCount = reports.length * 4;
  const scoreSum = reports.reduce(
    (acc, r) =>
      acc +
      (r.scores?.accuracy ?? 0) +
      (r.scores?.communication ?? 0) +
      (r.scores?.efficiency ?? 0) +
      (r.scores?.problemSolving ?? 0),
    0
  );

  return res.status(200).json({
    totalSessions: sessions.length,
    completedSessions: completedIds.length,
    inProgressSessions: sessions.filter((s) => s.status === 'in_progress').length,
    averageScore: scoreCount ? Math.round(scoreSum / scoreCount) : 0,
    recentSessions: sessions.slice(0, 5)
  });
});

export const dashboardRouter = router;
