import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from '../utils/AppError';

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');

  if (type !== 'Bearer' || !token) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Missing access token'));
  }

  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET);
    if (typeof payload === 'string' || !payload.sub) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Invalid access token'));
    }
    req.userId = payload.sub;
    next();
  } catch (err) {
    const code = err instanceof jwt.TokenExpiredError ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED';
    next(new AppError(401, code, 'Invalid or expired access token'));
  }
}