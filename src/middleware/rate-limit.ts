import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const defaultRateLimitMessage = {
  code: 'RATE_LIMITED',
  message: 'Too many requests. Please try again later.',
  details: {}
};

export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: defaultRateLimitMessage
});

export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMITED',
    message: 'AI request rate exceeded. Please retry shortly.',
    details: {}
  }
});

export const contactIpRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: env.CONTACT_RATE_LIMIT_PER_IP,
  standardHeaders: true,
  legacyHeaders: false,
  message: defaultRateLimitMessage
});

export const contactEmailRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: env.CONTACT_RATE_LIMIT_PER_EMAIL,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return email || req.ip || req.socket.remoteAddress || 'unknown';
  },
  message: defaultRateLimitMessage
});
