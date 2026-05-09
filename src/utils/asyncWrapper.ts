import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async route or middleware, catching any returned promise rejection
 * and passing it to the Express NextFunction implicitly.
 */
export function asyncWrapper(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any> | any,
): RequestHandler {
  return function (req: Request, res: Response, next: NextFunction): void {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
