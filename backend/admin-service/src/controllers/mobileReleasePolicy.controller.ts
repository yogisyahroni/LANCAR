import { Request, Response } from 'express';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';
import {
  listMobileReleasePolicies,
  estimateMobileReleasePolicyImpact,
  MobileReleasePolicyError,
  RELEASE_CLIENT_TYPES,
  RELEASE_PLATFORMS,
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

export const estimateAdminMobileReleasePolicyImpact = async (req: Request, res: Response): Promise<void> => {
  try {
    const marketCode = String(req.query.market_code || '').trim().toLowerCase();
    const clientType = String(req.query.client_type || '').trim() as ReleaseClientType;
    const platform = String(req.query.platform || '').trim() as ReleasePlatform;
    const minimumVersion = String(req.query.min_supported_version_name || '').trim();
    if (!marketCode || !clientType || !platform || !minimumVersion
      || !RELEASE_CLIENT_TYPES.includes(clientType)
      || !RELEASE_PLATFORMS.includes(platform)) {
      throw new MobileReleasePolicyError('INVALID_MOBILE_RELEASE_POLICY_IMPACT', 400, 'market_code, client_type, platform and min_supported_version_name are required');
    }
    const data = await estimateMobileReleasePolicyImpact({
      market_code: marketCode,
      client_type: clientType,
      platform,
      min_supported_version_name: minimumVersion,
      window_days: Number(req.query.window_days || 30),
    });
    res.json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'impact');
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
