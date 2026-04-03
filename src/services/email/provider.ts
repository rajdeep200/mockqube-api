import { Resend } from 'resend';
import { env } from '../../config/env.js';

const resend = new Resend(env.RESEND_API_KEY);

export async function sendPasswordResetEmail(input: { to: string; resetUrl: string; name: string }): Promise<void> {
  const response = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: 'Reset your MockQube password',
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <p>Hi ${input.name},</p>
        <p>We received a request to reset your MockQube password.</p>
        <p><a href="${input.resetUrl}">Reset Password</a></p>
        <p>This link expires in 30 minutes.</p>
      </div>
    `
  });

  if (response.error) {
    throw new Error(response.error.message);
  }
}
