import { PLAN_ENTITLEMENTS, DEFAULT_DSA_TRACK } from '../../config/subscription-plans.js';
import {
  type DsaTrack,
  type InterviewMode,
  type ResolvedEntitlements,
  type SubscriptionPlan,
  type SubscriptionStatus
} from '../../common/subscription.js';
import { Types } from 'mongoose';
import { InterviewSessionModel } from '../../models/interview-session.model.js';
import { FeedbackReportModel } from '../../models/feedback-report.model.js';

type SubscriptionUser = {
  _id: string;
  subscriptionPlan?: SubscriptionPlan | null;
  subscriptionStatus?: SubscriptionStatus | null;
  primaryDsaTrack?: DsaTrack | null;
  featureFlags?: string[] | null;
};

export function monthWindow(date = new Date()): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0))
  };
}

export function resolveUserPlan(user: SubscriptionUser): SubscriptionPlan {
  return user.subscriptionPlan ?? 'basic';
}

export function isSubscriptionActive(user: SubscriptionUser): boolean {
  const status = user.subscriptionStatus ?? 'active';
  return status === 'active' || status === 'trialing';
}

export function resolveEntitlements(user: SubscriptionUser): ResolvedEntitlements {
  const plan = resolveUserPlan(user);
  const template = PLAN_ENTITLEMENTS[plan];

  const allowedTracks = template.allowedTracks === 'primary_only'
    ? [user.primaryDsaTrack ?? DEFAULT_DSA_TRACK]
    : template.allowedTracks;

  return {
    ...template,
    allowedTracks
  };
}

export async function getMonthlyInterviewUsage(userId: string, now = new Date()): Promise<number> {
  const { start, end } = monthWindow(now);
  return InterviewSessionModel.countDocuments({
    userId,
    createdAt: { $gte: start, $lt: end }
  });
}

export async function canCreateInterview(user: SubscriptionUser): Promise<{
  allowed: boolean;
  reason?: 'SUBSCRIPTION_INACTIVE' | 'PLAN_LIMIT_REACHED';
  usage: number;
  limit: number | null;
}> {
  if (!isSubscriptionActive(user)) {
    return { allowed: false, reason: 'SUBSCRIPTION_INACTIVE', usage: 0, limit: null };
  }

  const entitlements = resolveEntitlements(user);
  const usage = await getMonthlyInterviewUsage(String(user._id));

  if (entitlements.interviewsPerMonth !== null && usage >= entitlements.interviewsPerMonth) {
    return {
      allowed: false,
      reason: 'PLAN_LIMIT_REACHED',
      usage,
      limit: entitlements.interviewsPerMonth
    };
  }

  return { allowed: true, usage, limit: entitlements.interviewsPerMonth };
}

export function isTrackAllowed(user: SubscriptionUser, requestedTrack?: string | null): boolean {
  if (!requestedTrack) return true;
  const entitlements = resolveEntitlements(user);
  return entitlements.allowedTracks.includes(requestedTrack as DsaTrack);
}

export function isModeAllowed(user: SubscriptionUser, requestedMode?: string | null): boolean {
  if (!requestedMode) return true;
  const entitlements = resolveEntitlements(user);
  return entitlements.allowedModes.includes(requestedMode as InterviewMode);
}

export async function isReportVisibleToPlan(user: SubscriptionUser, reportCreatedAt: Date): Promise<boolean> {
  const entitlements = resolveEntitlements(user);
  if (entitlements.maxVisibleReports === null) return true;

  const newerCount = await FeedbackReportModel.aggregate([
    {
      $lookup: {
        from: 'interviewsessions',
        localField: 'sessionId',
        foreignField: '_id',
        as: 'session'
      }
    },
    { $unwind: '$session' },
    {
      $match: {
        'session.userId': new Types.ObjectId(String(user._id)),
        createdAt: { $gt: reportCreatedAt }
      }
    },
    { $count: 'count' }
  ]);

  const count = newerCount[0]?.count ?? 0;
  return count < entitlements.maxVisibleReports;
}

export function shapeReportByPlan<T extends {
  feedbackSummary: string;
  solutionOverview: string;
  recommendations: string[];
  scores: Record<string, number>;
  [key: string]: unknown;
}>(user: SubscriptionUser, report: T): T & { advancedInsights?: Record<string, unknown> } {
  const entitlements = resolveEntitlements(user);

  if (entitlements.feedbackTier === 'summary') {
    return {
      ...report,
      solutionOverview: report.solutionOverview.slice(0, 220),
      recommendations: report.recommendations.slice(0, 2),
      scores: {
        overall: Math.round(Object.values(report.scores).reduce((acc, value) => acc + value, 0) / Math.max(1, Object.keys(report.scores).length))
      }
    } as T & { advancedInsights?: Record<string, unknown> };
  }

  if (entitlements.feedbackTier === 'advanced') {
    return {
      ...report,
      advancedInsights: {
        scoreVariance: Math.max(...Object.values(report.scores)) - Math.min(...Object.values(report.scores)),
        strongestDimension: Object.entries(report.scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        weakestDimension: Object.entries(report.scores).sort((a, b) => a[1] - b[1])[0]?.[0] ?? null
      }
    };
  }

  return report;
}

export function hasFeatureFlag(user: SubscriptionUser, flag: string): boolean {
  if (resolveUserPlan(user) === 'premium' && flag.startsWith('early_access:')) {
    return true;
  }
  return (user.featureFlags ?? []).includes(flag);
}
