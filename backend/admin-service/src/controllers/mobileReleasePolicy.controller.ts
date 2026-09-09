import { Request, Response } from 'express';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';
import {
  listMobileReleasePolicies,
  MobileReleasePolicyError,
  upsertMobileReleasePolicy,
  type ReleaseClientType,
  type ReleasePlatform,
} from '../services/mobileReleasePolicy';

const correlationId = (req: Request, res: Response): string | null =>
  (res.locals.correlationId as string | undefined)
  || (typeof req.headers['x-correlation-id'] === 'string' ? req.headers['x-correlation-id'] : null);

const respondWithError = (res: Response, error: unknown, operation: string): void => {
  if (error instanceof MobileReleasePolicyError) {
    res.status(error.status).json({ success: false, code: error.code, message: error.message });
    return;
  }
  securityLog.error(`mobile_release_policy_${operation}_failed`, {
    error: error instanceof Error ? error.message : 'unknown',
  });
  res.status(500).json({
    success: false,
    code: 'MOBILE_RELEASE_POLICY_INTERNAL_ERROR',
    message: 'Mobile release policy service failed',
  });
};

export const listAdminMobileReleasePolicies = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await listMobileReleasePolicies(req.query as Record<string, unknown>);
    res.json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'list');
  }
};

export const upsertAdminMobileReleasePolicy = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await upsertMobileReleasePolicy({
      ...req.body,
      market_code: req.params.marketCode,
      client_type: req.params.clientType as ReleaseClientType,
      platform: req.params.platform as ReleasePlatform,
    }, getActorId(req), correlationId(req, res));
    res.json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'upsert');
  }
};
