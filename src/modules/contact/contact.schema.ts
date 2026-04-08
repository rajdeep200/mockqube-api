import { z } from 'zod';

export const createContactMessageSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters long.').max(100, 'Name must be at most 100 characters long.'),
  email: z.string().trim().email('Email must be valid.').max(254, 'Email must be at most 254 characters long.'),
  message: z
    .string()
    .trim()
    .min(10, 'Message must be at least 10 characters long.')
    .max(5000, 'Message must be at most 5000 characters long.')
});

export type CreateContactMessageInput = z.infer<typeof createContactMessageSchema>;
