import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { ApiError } from '../../common/api-error.js';
import { logger } from '../../common/logger.js';
import { aiRateLimit } from '../../middleware/rate-limit.js';
import { synthesizeAwsPollySpeech } from '../../services/tts/polly.service.js';
import { ttsRequestSchema } from './tts.schema.js';

export const ttsRouter = Router();

ttsRouter.post('/', aiRateLimit, async (req, res, next) => {
  const requestId = req.header('x-request-id') ?? randomUUID();

  try {
    const payload = ttsRequestSchema.parse(req.body);

    logger.info('TTS request received', {
      requestId,
      sessionId: payload.sessionId,
      voiceProvider: payload.voiceProvider
    });

    if (payload.voiceProvider !== 'aws-polly') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Unsupported voice provider.', {
        voiceProvider: payload.voiceProvider
      });
    }

    const { audioBase64, mimeType } = await synthesizeAwsPollySpeech(payload.text);

    logger.info('TTS request completed', {
      requestId,
      sessionId: payload.sessionId,
      mimeType,
      bytes: Buffer.byteLength(audioBase64, 'base64')
    });

    return res.status(200).json({ audioBase64, mimeType });
  } catch (error) {
    logger.error('TTS request failed', {
      requestId,
      sessionId: typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined,
      error: error instanceof Error ? error.message : String(error)
    });

    return next(error);
  }
});
