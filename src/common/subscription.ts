export const SUBSCRIPTION_PLANS = ['basic', 'pro', 'premium'] as const;
export const SUBSCRIPTION_STATUSES = ['active', 'trialing', 'cancelled', 'past_due'] as const;

export const DSA_TRACKS = [
  'arrays',
  'strings',
  'linked_list',
  'stack_queue',
  'tree',
  'heap',
  'graph',
  'dynamic_programming'
] as const;

export const INTERVIEW_MODES = ['mixed', 'topic_focused', 'company_tagged'] as const;

export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type DsaTrack = (typeof DSA_TRACKS)[number];
export type InterviewMode = (typeof INTERVIEW_MODES)[number];
export type FeedbackTier = 'summary' | 'detailed' | 'advanced';
export type SupportTier = 'standard' | 'priority' | 'fastest';

export type ResolvedEntitlements = {
  interviewsPerMonth: number | null;
  feedbackTier: FeedbackTier;
  maxVisibleReports: number | null;
  performanceWindowDays: number | null;
  allowedTracks: DsaTrack[];
  allowedModes: InterviewMode[];
  supportTier: SupportTier;
  earlyAccess: boolean;
};
