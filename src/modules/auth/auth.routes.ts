import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { ApiError } from '../../common/api-error.js';
import { env } from '../../config/env.js';
import { signAccessToken } from '../../middleware/auth.js';
import { UserModel } from '../../models/user.model.js';
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema } from './auth.schema.js';
import { sendForgotPasswordEmail } from '../../services/email/resend-email.service.js';

const router = Router();

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
    const resetLink = `${env.FRONTEND_ORIGIN}/reset-password?email=${encodeURIComponent(email)}`;
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

router.post('/reset-password', async (req, res) => {
  const payload = resetPasswordSchema.parse(req.body);
  const user = await UserModel.findOne({ email: payload.email.toLowerCase() });
  if (!user) {
    throw new ApiError(404, 'NOT_FOUND', 'User not found.');
  }

  user.passwordHash = await bcrypt.hash(payload.newPassword, 10);
  await user.save();

  return res.status(200).json({ success: true });
});

export const authRouter = router;
