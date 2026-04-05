import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { ApiError } from '../../common/api-error.js';
import { env } from '../../config/env.js';

const DEFAULT_VOICE_ID = 'Joanna';

let pollyClient: PollyClient | null = null;

function getPollyClient(): PollyClient {
  if (!env.AWS_REGION || !env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new ApiError(502, 'AI_PROVIDER_ERROR', 'AWS Polly is not configured.', { provider: 'aws-polly' });
  }

  if (!pollyClient) {
    pollyClient = new PollyClient({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY
      }
    });
  }

  return pollyClient;
}

function assertAudioStream(audioStream: unknown): asserts audioStream is {
  transformToByteArray?: () => Promise<Uint8Array>;
} {
  if (!audioStream || typeof audioStream !== 'object') {
    throw new ApiError(422, 'AI_PROVIDER_ERROR', 'AWS Polly returned empty audio.', {
      provider: 'aws-polly'
    });
  }
}

export async function synthesizeAwsPollySpeech(text: string): Promise<{ audioBase64: string; mimeType: string }> {
  const client = getPollyClient();

  let response;
  try {
    response = await client.send(
      new SynthesizeSpeechCommand({
        Engine: 'neural',
        OutputFormat: 'mp3',
        Text: text,
        VoiceId: env.AWS_POLLY_VOICE_ID ?? DEFAULT_VOICE_ID
      })
    );
  } catch (error) {
    throw new ApiError(502, 'AI_PROVIDER_ERROR', 'Failed to generate AWS Polly audio.', {
      provider: 'aws-polly',
      error: error instanceof Error ? error.message : String(error)
    });
  }

  assertAudioStream(response.AudioStream);

  let audioBytes: Uint8Array;
  try {
    if (typeof response.AudioStream.transformToByteArray === 'function') {
      audioBytes = await response.AudioStream.transformToByteArray();
    } else {
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.AudioStream as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      audioBytes = Buffer.concat(chunks);
    }
  } catch (error) {
    throw new ApiError(502, 'AI_PROVIDER_ERROR', 'Unable to read AWS Polly audio stream.', {
      provider: 'aws-polly',
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const audioBase64 = Buffer.from(audioBytes).toString('base64');
  if (!audioBase64) {
    throw new ApiError(422, 'AI_PROVIDER_ERROR', 'AWS Polly produced empty audio payload.', {
      provider: 'aws-polly'
    });
  }

  return {
    audioBase64,
    mimeType: 'audio/mpeg'
  };
}
