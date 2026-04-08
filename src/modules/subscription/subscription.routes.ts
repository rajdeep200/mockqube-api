import { Router } from 'express';
import { ApiError } from '../../common/api-error.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authRequired, type AuthenticatedRequest } from '../../middleware/auth.js';
import { UserModel } from '../../models/user.model.js';
import { canCreateInterview, getMonthlyInterviewUsage, resolveEntitlements } from '../../services/subscription/entitlement.service.js';

const router = Router();
router.use(authRequired);

router.get('/me', asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const user = await UserModel.findById(authReq.user!.sub).select({
    subscriptionPlan: 1,
    subscriptionStatus: 1,
    subscriptionStartedAt: 1,
    subscriptionEndsAt: 1,
    primaryDsaTrack: 1,
    featureFlags: 1
  });

  if (!user) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found.');
  }

  const usageThisMonth = await getMonthlyInterviewUsage(String(user._id));
  const entitlementState = await canCreateInterview(user);
  const entitlements = resolveEntitlements(user);

  return res.status(200).json({
    plan: user.subscriptionPlan ?? 'basic',
    subscriptionStatus: user.subscriptionStatus ?? 'active',
    subscriptionStartedAt: user.subscriptionStartedAt,
    subscriptionEndsAt: user.subscriptionEndsAt,
    primaryDsaTrack: user.primaryDsaTrack,
    usageThisMonth,
    remainingInterviewCount:
      entitlements.interviewsPerMonth === null ? null : Math.max(0, entitlements.interviewsPerMonth - usageThisMonth),
    canCreateInterview: entitlementState.allowed,
    entitlements
  });
}));

export const subscriptionRouter = router;
