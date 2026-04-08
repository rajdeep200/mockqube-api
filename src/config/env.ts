import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1),
  FRONTEND_ORIGIN: z.string().url().optional(),
  FRONTEND_ORIGINS: z.string().optional(),
  CLIENT_URL: z.string().url().optional(),
  API_BASE_URL: z.string().url().default('http://localhost:3000'),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),
  SESSION_SECRET: z.string().min(16).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  AWS_REGION: z.string().min(1).optional(),
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  AWS_POLLY_VOICE_ID: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().default('onboarding@resend.dev'),
  SUPPORT_EMAIL: z.string().email().default('support@mockqube.com'),
  CONTACT_RATE_LIMIT_PER_IP: z.coerce.number().int().positive().default(5),
  CONTACT_RATE_LIMIT_PER_EMAIL: z.coerce.number().int().positive().default(3)
});

const parsedEnv = EnvSchema.parse(process.env);

const clientUrl = parsedEnv.CLIENT_URL ?? parsedEnv.FRONTEND_ORIGIN;
const localDefaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:5137',
  'http://127.0.0.1:5137'
];
const frontendOriginsRaw =
  parsedEnv.FRONTEND_ORIGINS ?? clientUrl ?? parsedEnv.FRONTEND_ORIGIN ?? localDefaultOrigins.join(',');

export const env = {
  ...parsedEnv,
  CLIENT_URL: clientUrl ?? 'http://localhost:5137',
  SESSION_SECRET: parsedEnv.SESSION_SECRET ?? parsedEnv.JWT_SECRET,
  FRONTEND_ORIGINS: frontendOriginsRaw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
};
