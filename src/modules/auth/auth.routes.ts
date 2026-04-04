import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { ApiError } from '../../common/api-error.js';
import { env } from '../../config/env.js';
import { signAccessToken } from '../../middleware/auth.js';
import { PasswordResetTokenModel } from '../../models/password-reset-token.model.js';
import { UserModel } from '../../models/user.model.js';
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema } from './auth.schema.js';
import { sendForgotPasswordEmail } from '../../services/email/resend-email.service.js';

const router = Router();

/**
 * @openapi
 * /v1/auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Register a user and return access token
 */
router.post('/signup', async (req, res) => {
  const payload = signupSchema.parse(req.body);
  const email = payload.email.toLowerCase();

  const existing = await UserModel.findOne({ email });
  if (existing) {
    throw new ApiError(409, 'CONFLICT', 'Email already registered.');
  }

  const passwordHash = await bcrypt.hash(payload.password, 10);
  const user = await UserModel.create({ name: payload.name, email, passwordHash });

  const accessToken = signAccessToken({
    sub: String(user._id),
    email: user.email,
    name: user.name
  });

  return res.status(201).json({
    user: { id: String(user._id), name: user.name, email: user.email, createdAt: user.createdAt.toISOString() },
    accessToken
  });
});

/**
 * @openapi
 * /v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login user and return access token
 */
router.post('/login', async (req, res) => {
  const payload = loginSchema.parse(req.body);
  const email = payload.email.toLowerCase();

  const user = await UserModel.findOne({ email });
  if (!user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid credentials.');
  }

  const validPassword = await bcrypt.compare(payload.password, user.passwordHash);
  if (!validPassword) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid credentials.');
  }

  const accessToken = signAccessToken({ sub: String(user._id), email: user.email, name: user.name });

  return res.status(200).json({
    user: { id: String(user._id), name: user.name, email: user.email, createdAt: user.createdAt.toISOString() },
    accessToken
  });
});

/**
 * @openapi
 * /v1/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Start password reset flow
 */
router.post('/forgot-password', async (req, res) => {
  const payload = forgotPasswordSchema.parse(req.body);
  const email = payload.email.toLowerCase();

  const user = await UserModel.findOne({ email });

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await PasswordResetTokenModel.deleteMany({ userId: user._id, usedAt: null });
    await PasswordResetTokenModel.create({ userId: user._id, tokenHash, expiresAt, usedAt: null });

    const resetLink = `${env.FRONTEND_ORIGIN}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await sendForgotPasswordEmail({
      to: user.email,
      name: user.name,
      resetLink
    });
  }

  return res.status(200).json({
    success: true,
    message: 'If account exists, password reset flow was initiated.'
  });
});

/**
 * @openapi
 * /v1/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password using one-time token
 */
router.post('/reset-password', async (req, res) => {
  const payload = resetPasswordSchema.parse(req.body);
  const tokenHash = crypto.createHash('sha256').update(payload.token).digest('hex');
  const resetToken = await PasswordResetTokenModel.findOne({
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() }
  });
  if (!resetToken) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Password reset token is invalid or expired.');
  }

  const user = await UserModel.findById(resetToken.userId);
  if (!user) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found for the provided reset token.');
  }

  user.passwordHash = await bcrypt.hash(payload.newPassword, 10);
  resetToken.usedAt = new Date();
  await Promise.all([user.save(), resetToken.save()]);

  return res.status(200).json({ success: true });
});

export const authRouter = router;
