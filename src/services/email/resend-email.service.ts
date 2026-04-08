import { env } from '../../config/env.js';
import { logger } from '../../common/logger.js';

type ForgotPasswordEmailParams = {
  to: string;
  name: string;
  resetLink: string;
};

type ContactSupportNotificationParams = {
  to: string;
  submitterName: string;
  submitterEmail: string;
  sourcePlan: 'basic' | 'pro' | 'premium';
  supportTier: 'standard' | 'priority' | 'fastest';
  message: string;
  submittedAt: Date;
  ip?: string | undefined;
  userAgent?: string | undefined;
};

const buildForgotPasswordHtml = ({ name, resetLink }: Omit<ForgotPasswordEmailParams, 'to'>): string => `
  <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
    <h2>Reset your MockQube password</h2>
    <p>Hi ${name},</p>
    <p>We received a request to reset your password. Click the button below to continue.</p>
    <p>
      <a href="${resetLink}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none;">Reset password</a>
    </p>
    <p>If you did not request this, you can safely ignore this email.</p>
  </div>
`;

const buildContactSupportHtml = ({
  submitterName,
  submitterEmail,
  sourcePlan,
  supportTier,
  message,
  submittedAt,
  ip,
  userAgent
}: Omit<ContactSupportNotificationParams, 'to'>): string => `
  <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
    <h2>New Contact Us submission</h2>
    <p><strong>Name:</strong> ${submitterName}</p>
    <p><strong>Email:</strong> ${submitterEmail}</p>
    <p><strong>Plan:</strong> ${sourcePlan}</p>
    <p><strong>Support tier:</strong> ${supportTier}</p>
    <p><strong>Submitted at:</strong> ${submittedAt.toISOString()}</p>
    <p><strong>IP:</strong> ${ip ?? 'n/a'}</p>
    <p><strong>User-Agent:</strong> ${userAgent ?? 'n/a'}</p>
    <hr />
    <p style="white-space:pre-wrap;">${message}</p>
  </div>
`;

export const sendForgotPasswordEmail = async ({ to, name, resetLink }: ForgotPasswordEmailParams): Promise<void> => {
  if (!env.RESEND_API_KEY) {
    logger.info('Resend is not configured; skipping forgot-password email send.', { to });
    return;
  }

  const { Resend } = await import('resend');
  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to,
    subject: 'Reset your MockQube password',
    html: buildForgotPasswordHtml({ name, resetLink })
  });

  if (error) {
    logger.error('Failed to send forgot-password email with Resend.', {
      to,
      error
    });
  }
};

export const sendContactSupportNotification = async ({
  to,
  submitterName,
  submitterEmail,
  sourcePlan,
  supportTier,
  message,
  submittedAt,
  ip,
  userAgent
}: ContactSupportNotificationParams): Promise<void> => {
  if (!env.RESEND_API_KEY) {
    logger.info('Resend is not configured; skipping contact support notification send.');
    return;
  }

  const { Resend } = await import('resend');
  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to,
    subject: `[${supportTier.toUpperCase()}] New contact message from ${submitterName}`,
    html: buildContactSupportHtml({ submitterName, submitterEmail, sourcePlan, supportTier, message, submittedAt, ip, userAgent })
  });

  if (error) {
    throw new Error(error.message || 'Resend returned an error while sending contact notification.');
  }
};
