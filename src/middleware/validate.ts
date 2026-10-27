import { NextFunction, Request, Response } from 'express';
import { ZodObject, ZodTypeAny } from 'zod';
import { AppError } from '../utils/AppError';

/**
 * Validates request data against a Zod schema.
 *
 * Supports three envelope shapes:
 *  - `{ body, params }` — validates req.body + req.params, writes back to req.body
 *  - `{ query }`        — validates req.query, writes back to req.query
 *  - plain schema       — validates req.body directly (legacy)
 */
export const validate =
  (schema: ZodTypeAny) => (req: Request, _res: Response, next: NextFunction) => {
    const isBodyEnvelope =
      schema instanceof ZodObject && schema.shape && 'body' in schema.shape;
    const isQueryEnvelope =
      schema instanceof ZodObject && schema.shape && 'query' in schema.shape && !('body' in schema.shape);

    let input: unknown;
    if (isBodyEnvelope)       input = { body: req.body, params: req.params };
    else if (isQueryEnvelope) input = { query: req.query };
    else                      input = req.body;

    const result = schema.safeParse(input);

    if (!result.success) {
      return next(
        new AppError(400, 'VALIDATION_ERROR', 'Invalid input', result.error.flatten().fieldErrors),
      );
    }

    if (isBodyEnvelope) {
      req.body = (result.data as { body: unknown }).body;
    } else if (isQueryEnvelope) {
      // Cast is safe — coerce already ran so values are numbers
      req.query = (result.data as { query: Record<string, unknown> }).query as typeof req.query;
    } else {
      req.body = result.data;
    }
    next();
  };
