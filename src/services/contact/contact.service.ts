import crypto from 'node:crypto';
import { ApiError } from '../../common/api-error.js';
import { logger } from '../../common/logger.js';
import { env } from '../../config/env.js';
import { ContactMessageModel } from '../../models/contact-message.model.js';
import { UserModel } from '../../models/user.model.js';
import { sendContactSupportNotification } from '../email/resend-email.service.js';
import type { CreateContactMessageInput } from '../../modules/contact/contact.schema.js';
import { resolveEntitlements } from '../subscription/entitlement.service.js';

const RECENT_DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
const URL_PATTERN = /(https?:\/\/|www\.)/i;

export type CreateContactMessageMeta = {
  ip?: string | undefined;
  userAgent?: string | undefined;
};

function redactEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return 'unknown';
  const localPrefix = local.slice(0, 2).padEnd(2, '*');
  return `${localPrefix}***@${domain}`;
}

function hashMessageForLog(message: string): string {
  return crypto.createHash('sha256').update(message).digest('hex').slice(0, 12);
}

export async function enforceSpamGuards(payload: CreateContactMessageInput, meta: CreateContactMessageMeta): Promise<void> {
  const now = Date.now();
  const recentThreshold = new Date(now - RECENT_DUPLICATE_WINDOW_MS);

  if (URL_PATTERN.test(payload.message)) {
    const similarUrlSpamCount = await ContactMessageModel.countDocuments({
      createdAt: { $gte: recentThreshold },
      $or: [{ email: payload.email.toLowerCase() }, ...(meta.ip ? [{ ip: meta.ip }] : [])],
      message: { $regex: URL_PATTERN }
    });

    if (similarUrlSpamCount >= 2) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many suspicious submissions. Please try again later.');
    }
  }

  const duplicate = await ContactMessageModel.findOne({
    email: payload.email.toLowerCase(),
    message: payload.message,
    createdAt: { $gte: recentThreshold }
  }).select({ _id: 1 });

  if (duplicate) {
    throw new ApiError(429, 'RATE_LIMITED', 'Duplicate submission detected. Please wait before retrying.');
  }
}

export async function createContactMessage(payload: CreateContactMessageInput, meta: CreateContactMessageMeta): Promise<void> {
  await enforceSpamGuards(payload, meta);

  const matchedUser = await UserModel.findOne({ email: payload.email.toLowerCase() }).select({
    subscriptionPlan: 1,
    subscriptionStatus: 1,
    primaryDsaTrack: 1
  });
  const sourcePlan = matchedUser?.subscriptionPlan ?? 'basic';
  const supportTier = resolveEntitlements({
    _id: matchedUser?._id ?? '000000000000000000000000',
    subscriptionPlan: sourcePlan,
    subscriptionStatus: matchedUser?.subscriptionStatus,
    primaryDsaTrack: matchedUser?.primaryDsaTrack
  }).supportTier;

  const savedMessage = await ContactMessageModel.create({
    name: payload.name,
    email: payload.email.toLowerCase(),
    message: payload.message,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
    sourcePlan,
    supportTier
  });

  sendContactSupportNotification({
    to: env.SUPPORT_EMAIL,
    submitterName: payload.name,
    submitterEmail: payload.email,
    sourcePlan,
    supportTier,
    message: payload.message,
    submittedAt: savedMessage.createdAt,
    ip: meta.ip,
    userAgent: meta.userAgent
  }).catch((error) => {
    logger.error('contact_notification_failed', {
      contactMessageId: String(savedMessage._id),
      email: redactEmail(payload.email),
      messageHash: hashMessageForLog(payload.message),
      error: error instanceof Error ? error.message : 'unknown'
    });
  });
}
