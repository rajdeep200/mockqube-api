import { z } from 'zod';

export const createSessionSchema = z.object({
  company: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']).or(z.string().min(1)),
  duration: z.number().int().positive(),
  role: z.string().min(1).optional()
});

export const patchSessionSchema = z.object({
  status: z.enum(['created', 'in_progress', 'completed', 'cancelled']).optional()
});

export const createMessageSchema = z.object({
  text: z.string().min(1)
});

export const createCodeSubmissionSchema = z.object({
  code: z.string().min(1),
  language: z.string().min(1)
});
