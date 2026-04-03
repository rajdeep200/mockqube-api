import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { globalRateLimit } from './middleware/rate-limit.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { interviewsRouter } from './modules/interviews/interviews.routes.js';
import { swaggerSpec } from './swagger/openapi.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(globalRateLimit);

app.get('/health', (_req, res) => {
  return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/v1/auth', authRouter);
app.use('/v1/interview-sessions', interviewsRouter);
app.use('/v1/dashboard', dashboardRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
