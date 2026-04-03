import { env } from '../../config/env.js';
import { logger } from '../../common/logger.js';

type ForgotPasswordEmailParams = {
  to: string;
  name: string;
  resetLink: string;
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

export const sendForgotPasswordEmail = async ({ to, name, resetLink }: ForgotPasswordEmailParams): Promise<void> => {
  if (!env.RESEND_API_KEY) {
    logger.info('Resend is not configured; skipping forgot-password email send.', { to });
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to,
      subject: 'Reset your MockQube password',
      html: buildForgotPasswordHtml({ name, resetLink })
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('Failed to send forgot-password email with Resend.', {
      status: response.status,
      to,
      errorBody
    });
  }
};
