import { Request, Response, NextFunction } from 'express';
import { ZodObject, ZodError, ZodIssue } from 'zod';

export const validate = (schema: ZodObject<any>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          status: 'error',
          code: 'ERR_VALIDATION_FAILED',
          message: 'Request validation failed',
          details: error.issues.map((err: ZodIssue) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      return res.status(500).json({
        status: 'error',
        code: 'ERR_INTERNAL_SERVER_ERROR',
        message: 'Internal server error during validation',
      });
    }
  };
};
