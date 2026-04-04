import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1),
  FRONTEND_ORIGIN: z.string().url().optional(),
  FRONTEND_ORIGINS: z.string().optional(),
  API_BASE_URL: z.string().url().default('http://localhost:3000'),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().default('onboarding@resend.dev')
});

const parsedEnv = EnvSchema.parse(process.env);

const localDefaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8081',
  'http://127.0.0.1:8081'
];
const frontendOriginsRaw =
  parsedEnv.FRONTEND_ORIGINS ?? parsedEnv.FRONTEND_ORIGIN ?? localDefaultOrigins.join(',');

export const env = {
  ...parsedEnv,
  FRONTEND_ORIGINS: frontendOriginsRaw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
};
