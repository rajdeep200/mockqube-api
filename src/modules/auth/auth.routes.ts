import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import passport from 'passport';
import { ApiError } from '../../common/api-error.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { env } from '../../config/env.js';
import { isGoogleOAuthConfigured } from '../../config/passport.js';
import { signAccessToken } from '../../middleware/auth.js';
import { PasswordResetTokenModel } from '../../models/password-reset-token.model.js';
import { UserModel } from '../../models/user.model.js';
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema } from './auth.schema.js';
import { sendForgotPasswordEmail } from '../../services/email/resend-email.service.js';

const router = Router();

function formatUserResponse(user: {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  provider?: 'local' | 'google';
  createdAt: Date;
}) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    provider: user.provider ?? 'local',
    createdAt: user.createdAt.toISOString()
  };
}

/**
 * @openapi
 * /v1/auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Register a user and return access token
 */
router.post('/signup', asyncHandler(async (req, res) => {
  const payload = signupSchema.parse(req.body);
  const email = payload.email.toLowerCase();

  const existing = await UserModel.findOne({ email });
  if (existing) {
    throw new ApiError(409, 'CONFLICT', 'Email already registered.');
  }

  const passwordHash = await bcrypt.hash(payload.password, 10);
  const user = await UserModel.create({ name: payload.name, email, passwordHash, provider: 'local' });

  const accessToken = signAccessToken({
    sub: String(user._id),
    email: user.email,
    name: user.name
  });

  return res.status(201).json({
    user: formatUserResponse(user),
    accessToken
  });
}));

/**
 * @openapi
 * /v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login user and return access token
 */
router.post('/login', asyncHandler(async (req, res) => {
  const payload = loginSchema.parse(req.body);
  const email = payload.email.toLowerCase();

  const user = await UserModel.findOne({ email });
  if (!user || !user.passwordHash) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid credentials.');
  }

  const validPassword = await bcrypt.compare(payload.password, user.passwordHash);
  if (!validPassword) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid credentials.');
  }

  const accessToken = signAccessToken({ sub: String(user._id), email: user.email, name: user.name });

  return res.status(200).json({
    user: formatUserResponse(user),
    accessToken
  });
}));

router.get('/google', (req, res, next) => {
  if (!isGoogleOAuthConfigured()) {
    return next(new ApiError(503, 'INTERNAL_SERVER_ERROR', 'Google OAuth is not configured.'));
  }

  return passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: true,
    prompt: 'select_account'
  })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  if (!isGoogleOAuthConfigured()) {
    return next(new ApiError(503, 'INTERNAL_SERVER_ERROR', 'Google OAuth is not configured.'));
  }

  return passport.authenticate('google', {
    failureRedirect: `${env.CLIENT_URL}/login?error=google_auth_failed`,
    session: true
  })(req, res, next);
}, (_req, res) => {
  return res.redirect(`${env.CLIENT_URL}/dashboard`);
});

router.get('/me', (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required.');
  }

  return res.status(200).json({ user: req.user });
});

router.post('/logout', (req, res, next) => {
  req.logout((error) => {
    if (error) {
      return next(error);
    }

    req.session.destroy((destroyError) => {
      if (destroyError) {
        return next(destroyError);
      }

      res.clearCookie('mockqube.sid');
      return res.status(200).json({ success: true });
    });
  });
});

/**
 * @openapi
 * /v1/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Start password reset flow
 */
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const payload = forgotPasswordSchema.parse(req.body);
  const email = payload.email.toLowerCase();

  const user = await UserModel.findOne({ email });

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await PasswordResetTokenModel.deleteMany({ userId: user._id, usedAt: null });
    await PasswordResetTokenModel.create({ userId: user._id, tokenHash, expiresAt, usedAt: null });

    const resetLink = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
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
}));

/**
 * @openapi
 * /v1/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password using one-time token
 */
router.post('/reset-password', asyncHandler(async (req, res) => {
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
}));

export const authRouter = router;
