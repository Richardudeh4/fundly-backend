import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  console.error(err); // unexpected bug: log it, but don't leak details to the user
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', details: {} },
  });
}