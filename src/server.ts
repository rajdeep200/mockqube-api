import app from './app.js';
import { env } from './config/env.js';
import { connectToMongo } from './db/mongoose.js';
import { logger } from './common/logger.js';

async function bootstrap(): Promise<void> {
  await connectToMongo();
  app.listen(env.PORT, () => {
    logger.info('MockQube API started', { port: env.PORT });
  });
}

bootstrap().catch((error) => {
  logger.error('Failed to bootstrap server', {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
