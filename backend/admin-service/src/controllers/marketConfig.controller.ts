import { Request, Response } from 'express';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';
import {
  approveMarketConfig,
  createMarketConfig,
  getMarketAvailability,
  getMarketConfig,
  getMarketLegalDocuments,
  getMarketReadiness,
  getPublicMarketConfig,
  listMarketAudit,
  listMarketConfigs,
  MarketConfigError,
  updateMarketConfig,
  upsertMarketAvailability,
  upsertMarketLegalDocument,
} from '../services/marketConfig';

const correlationId = (req: Request, res: Response) =>
  (res.locals.correlationId as string | undefined) ||
  (typeof req.headers['x-correlation-id'] === 'string' ? req.headers['x-correlation-id'] : null);

const respondWithError = (res: Response, error: unknown, operation: string) => {
  if (error instanceof MarketConfigError) {
    res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
      ...(error.reasonCodes.length > 0 ? { reason_codes: error.reasonCodes } : {}),
    });
    return;
  }

  securityLog.error(`market_config_${operation}_failed`, { error });
  res.status(500).json({ success: false, code: 'MARKET_CONFIG_INTERNAL_ERROR', message: 'Market configuration service failed' });
};

const marketCodeFromRequest = (req: Request) => {
  const value = req.params.marketCode || req.query.market_code || req.headers['x-market-code'];
  return typeof value === 'string' ? value : '';
};

export const listAdminMarketConfigs = async (_req: Request, res: Response): Promise<void> => {
  try {
    const configs = await listMarketConfigs();
    res.json({ success: true, data: configs });
  } catch (error) {
    respondWithError(res, error, 'list');
  }
};

export const getAdminMarketConfig = async (req: Request, res: Response): Promise<void> => {
  const marketCode = marketCodeFromRequest(req);
  try {
    const [config, serviceAvailability, legalDocuments, readiness] = await Promise.all([
      getMarketConfig(marketCode),
      getMarketAvailability(marketCode),
      getMarketLegalDocuments(marketCode),
      getMarketReadiness(marketCode),
    ]);
    res.json({ success: true, data: { config, service_availability: serviceAvailability, legal_documents: legalDocuments, readiness } });
  } catch (error) {
    respondWithError(res, error, 'get');
  }
};

export const createAdminMarketConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await createMarketConfig(req.body, getActorId(req), correlationId(req, res));
    res.status(201).json({ success: true, data: config });
  } catch (error) {
    respondWithError(res, error, 'create');
  }
};

export const updateAdminMarketConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await updateMarketConfig(marketCodeFromRequest(req), req.body, getActorId(req), correlationId(req, res));
    res.json({ success: true, data: config });
  } catch (error) {
    respondWithError(res, error, 'update');
  }
};

export const upsertAdminMarketAvailability = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await upsertMarketAvailability(marketCodeFromRequest(req), req.body, getActorId(req), correlationId(req, res));
    res.json({ success: true, data: result });
  } catch (error) {
    respondWithError(res, error, 'availability');
  }
};

export const upsertAdminMarketLegalDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await upsertMarketLegalDocument(marketCodeFromRequest(req), req.body, getActorId(req), correlationId(req, res));
    res.json({ success: true, data: result });
  } catch (error) {
    respondWithError(res, error, 'legal_document');
  }
};

export const approveAdminMarketConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    const config = await approveMarketConfig(marketCodeFromRequest(req), getActorId(req), reason, correlationId(req, res));
    res.json({ success: true, data: config });
  } catch (error) {
    respondWithError(res, error, 'approve');
  }
};

export const listAdminMarketConfigAudit = async (req: Request, res: Response): Promise<void> => {
  try {
    const audit = await listMarketAudit(marketCodeFromRequest(req));
    res.json({ success: true, data: audit });
  } catch (error) {
    respondWithError(res, error, 'audit');
  }
};

export const getPublicMarketConfiguration = async (req: Request, res: Response): Promise<void> => {
  const marketCode = marketCodeFromRequest(req);
  if (!marketCode.trim()) {
    res.status(400).json({ success: false, code: 'MARKET_CODE_REQUIRED', message: 'market_code is required; no market fallback is applied' });
    return;
  }

  const cityCode = typeof req.query.city_code === 'string' ? req.query.city_code : null;
  try {
    const config = await getPublicMarketConfig(marketCode, cityCode);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ success: true, data: config });
  } catch (error) {
    respondWithError(res, error, 'public');
  }
};
