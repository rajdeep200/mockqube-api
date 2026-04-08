import type { DsaTrack, InterviewMode, ResolvedEntitlements, SubscriptionPlan } from '../common/subscription.js';
import { DSA_TRACKS, INTERVIEW_MODES } from '../common/subscription.js';

type PlanEntitlementTemplate = Omit<ResolvedEntitlements, 'allowedTracks'> & {
  allowedTracks: 'primary_only' | DsaTrack[];
};

export const PLAN_ENTITLEMENTS: Record<SubscriptionPlan, PlanEntitlementTemplate> = {
  basic: {
    interviewsPerMonth: 3,
    feedbackTier: 'summary',
    maxVisibleReports: 3,
    performanceWindowDays: null,
    allowedTracks: 'primary_only',
    allowedModes: ['mixed'],
    supportTier: 'standard',
    earlyAccess: false
  },
  pro: {
    interviewsPerMonth: 20,
    feedbackTier: 'detailed',
    maxVisibleReports: null,
    performanceWindowDays: 90,
    allowedTracks: [...DSA_TRACKS],
    allowedModes: [...INTERVIEW_MODES],
    supportTier: 'priority',
    earlyAccess: false
  },
  premium: {
    interviewsPerMonth: null,
    feedbackTier: 'advanced',
    maxVisibleReports: null,
    performanceWindowDays: null,
    allowedTracks: [...DSA_TRACKS],
    allowedModes: [...INTERVIEW_MODES],
    supportTier: 'fastest',
    earlyAccess: true
  }
};

export const DEFAULT_DSA_TRACK: DsaTrack = 'arrays';
export const DEFAULT_INTERVIEW_MODE: InterviewMode = 'mixed';
