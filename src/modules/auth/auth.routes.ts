import { randomBytes, createHash } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { ApiError } from '../../common/api-error.js';
import { env } from '../../config/env.js';
import { signAccessToken } from '../../middleware/auth.js';
import { PasswordResetTokenModel } from '../../models/password-reset-token.model.js';
import { UserModel } from '../../models/user.model.js';
import { sendPasswordResetEmail } from '../../services/email/provider.js';
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema } from './auth.schema.js';

const router = Router();

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

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

router.post('/forgot-password', async (req, res) => {
  const payload = forgotPasswordSchema.parse(req.body);
  const email = payload.email.toLowerCase();

  const user = await UserModel.findOne({ email });
  if (user) {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await PasswordResetTokenModel.create({
      userId: user._id,
      tokenHash,
      expiresAt
    });

    const resetUrl = `${env.APP_BASE_URL}/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail({ to: user.email, resetUrl, name: user.name });
  }

  return res.status(200).json({
    success: true,
    message: 'If account exists, password reset instructions were sent.'
  });
});

router.post('/reset-password', async (req, res) => {
  const payload = resetPasswordSchema.parse(req.body);
  const tokenHash = hashResetToken(payload.token);

  const resetRecord = await PasswordResetTokenModel.findOne({ tokenHash, usedAt: null });
  if (!resetRecord || resetRecord.expiresAt.getTime() < Date.now()) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Reset token is invalid or expired.');
  }

  const user = await UserModel.findById(resetRecord.userId);
  if (!user) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found.');
  }

  user.passwordHash = await bcrypt.hash(payload.newPassword, 10);
  await user.save();

  resetRecord.usedAt = new Date();
  await resetRecord.save();

  return res.status(200).json({ success: true });
});

export const authRouter = router;
