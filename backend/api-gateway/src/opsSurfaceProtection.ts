import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

type EnvLike = NodeJS.ProcessEnv;

const isProductionRuntime = (env: EnvLike = process.env) =>
  env.NODE_ENV === 'production' || env.ENVIRONMENT === 'production';

const timingSafeStringEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return '';
  }

  return authHeader.slice('Bearer '.length).trim();
};

const hasValidBasicAuth = (req: Request, username: string, password: string) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Basic ')) {
    return false;
  }

  try {
    const decodedValue = Buffer.from(authHeader.slice('Basic '.length), 'base64').toString('utf8');
    const separatorIndex = decodedValue.indexOf(':');
    if (separatorIndex === -1) {
      return false;
    }

    const providedUsername = decodedValue.slice(0, separatorIndex);
    const providedPassword = decodedValue.slice(separatorIndex + 1);

    return (
      timingSafeStringEqual(providedUsername, username) &&
      timingSafeStringEqual(providedPassword, password)
    );
  } catch {
    return false;
  }
};

export const protectDocs = (req: Request, res: Response, next: NextFunction) => {
  if (!isProductionRuntime()) {
    return next();
  }

  if (process.env.API_DOCS_ENABLED === 'false') {
    return res.status(404).json({
      status: 'error',
      code: 'ERR_NOT_FOUND',
      message: 'Not found',
    });
  }

  const username = process.env.DOCS_BASIC_AUTH_USERNAME;
  const password = process.env.DOCS_BASIC_AUTH_PASSWORD;

  if (!username || !password) {
    return res.status(404).json({
      status: 'error',
      code: 'ERR_NOT_FOUND',
      message: 'Not found',
    });
  }

  if (!hasValidBasicAuth(req, username, password)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="LANCAR API Docs", charset="UTF-8"');
    return res.status(401).json({
      status: 'error',
      code: 'ERR_DOCS_AUTH_REQUIRED',
      message: 'Documentation authentication required',
    });
  }

  return next();
};

export const protectMetrics = (req: Request, res: Response, next: NextFunction) => {
  if (!isProductionRuntime()) {
    return next();
  }

  const expectedToken = process.env.METRICS_BEARER_TOKEN;
  const providedToken = getBearerToken(req);

  if (!expectedToken || !providedToken || !timingSafeStringEqual(providedToken, expectedToken)) {
    return res.status(401).json({
      status: 'error',
      code: 'ERR_METRICS_AUTH_REQUIRED',
      message: 'Metrics authentication required',
    });
  }

  return next();
};
