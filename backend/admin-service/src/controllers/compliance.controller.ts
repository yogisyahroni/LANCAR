import { Request, Response } from 'express';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';
import {
  ComplianceError,
  getCompliancePolicy,
  listOwnComplianceConsents,
  recordComplianceConsent,
} from '../services/complianceBoundary';

const respondWithError = (res: Response, error: unknown, operation: string) => {
  if (error instanceof ComplianceError) {
    res.status(error.status).json({ success: false, code: error.code, message: error.message });
    return;
  }
  securityLog.error(`compliance_${operation}_failed`, { error });
  res.status(500).json({ success: false, code: 'COMPLIANCE_INTERNAL_ERROR', message: 'Compliance service failed' });
};

const marketCodeFromRequest = (req: Request) => {
  const value = req.query.market_code || req.headers['x-market-code'];
  return typeof value === 'string' ? value : '';
};

export const getPublicCompliancePolicy = async (req: Request, res: Response): Promise<void> => {
  const marketCode = marketCodeFromRequest(req);
  if (!marketCode) {
    res.status(400).json({ success: false, code: 'MARKET_CODE_REQUIRED', message: 'market_code is required; no market fallback is applied' });
    return;
  }
  try {
    const policy = await getCompliancePolicy(marketCode);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ success: true, data: policy });
  } catch (error) {
    respondWithError(res, error, 'public_policy');
  }
};

export const getAdminCompliancePolicy = async (req: Request, res: Response): Promise<void> => {
  const marketCode = marketCodeFromRequest(req);
  if (!marketCode) {
    res.status(400).json({ success: false, code: 'MARKET_CODE_REQUIRED', message: 'market_code is required' });
    return;
  }
  try {
    const policy = await getCompliancePolicy(marketCode);
    res.json({ success: true, data: policy });
  } catch (error) {
    respondWithError(res, error, 'admin_policy');
  }
};

export const createComplianceConsent = async (req: Request, res: Response): Promise<void> => {
  try {
    const consent = await recordComplianceConsent(
      req.body,
      { id: getActorId(req), role: req.user?.role || '' },
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] || null },
    );
    res.status(201).json({ success: true, data: consent });
  } catch (error) {
    respondWithError(res, error, 'consent_create');
  }
};

export const listComplianceConsents = async (req: Request, res: Response): Promise<void> => {
  try {
    const consents = await listOwnComplianceConsents({ id: getActorId(req), role: req.user?.role || '' });
    res.json({ success: true, data: consents });
  } catch (error) {
    respondWithError(res, error, 'consent_list');
  }
};
