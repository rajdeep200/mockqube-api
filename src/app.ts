import cors from 'cors';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from 'passport';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { initializePassport } from './config/passport.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { globalRateLimit } from './middleware/rate-limit.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { interviewsRouter } from './modules/interviews/interviews.routes.js';
import { ttsRouter } from './modules/tts/tts.routes.js';
import { contactRouter } from './modules/contact/contact.routes.js';
import { swaggerSpec } from './swagger/openapi.js';

const app = express();

app.set('trust proxy', 1);
initializePassport();

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.FRONTEND_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(globalRateLimit);
app.use(
  session({
    name: 'mockqube.sid',
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);
app.use(passport.initialize());
app.use(passport.session());

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Utility]
 *     summary: Health check
 */
app.get('/health', (_req, res) => {
  return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/v1/auth', authRouter);
app.use('/auth', authRouter);
app.use('/v1/interview-sessions', interviewsRouter);
app.use('/v1/dashboard', dashboardRouter);
app.use('/v1/contact', contactRouter);
app.use('/api/tts', ttsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
