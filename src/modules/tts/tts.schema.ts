import { z } from 'zod';

const SUPPORTED_VOICE_PROVIDERS = ['aws-polly'] as const;

export const ttsRequestSchema = z.object({
  sessionId: z.string().trim().min(1, 'sessionId is required.'),
  text: z.string().trim().min(1, 'text is required.').max(1000, 'text must be at most 1000 characters.'),
  voiceProvider: z.enum(SUPPORTED_VOICE_PROVIDERS).default('aws-polly')
});

export type TtsRequestPayload = z.infer<typeof ttsRequestSchema>;
