import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../common/api-error.js';
import { logger } from '../common/logger.js';

export function notFoundHandler(req: Request, res: Response): Response {
  return res.status(404).json({
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} not found.`,
    details: {}
  });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): Response {
  if (err instanceof ZodError) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      details: err.flatten()
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      code: err.code,
      message: err.message,
      details: err.details
    });
  }

  logger.error('Unhandled error', {
    method: req.method,
    path: req.path,
    error: err instanceof Error ? err.message : String(err)
  });

  return res.status(500).json({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Unexpected server error.',
    details: {}
  });
}
