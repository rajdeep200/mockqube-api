import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../common/api-error.js';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

export function authRequired(req: Request, _res: Response, next: NextFunction): void {
  const bearer = req.headers.authorization;
  if (!bearer?.startsWith('Bearer ')) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Missing bearer token.');
  }

  const token = bearer.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    (req as AuthenticatedRequest).user = decoded;
    next();
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'Token is invalid or expired.');
  }
}
