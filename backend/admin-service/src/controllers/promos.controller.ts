import { Request, Response } from 'express';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';
import {
  approvePromoCampaign,
  createPromoCampaign,
  getPromoCampaignById,
  getPromoCampaignAnalytics,
  getPromoMarginPolicies,
  listPromoCampaigns,
  pausePromoCampaign,
  previewPromoNotificationAudience,
  publishPromoCampaign,
  releasePromoReservation,
  safePromoError,
  sendPromoCampaignNotification,
  submitPromoCampaignForApproval,
  updatePromoCampaign,
  validatePromoForCheckout,
} from '../services/promoEngine';

const respondError = (res: Response, error: unknown) => { securityLog.error('PROMO ERROR:', error);
  const safeError = safePromoError(error);
  res.status(safeError.status).json({
    success: false,
    data: null,
    message: safeError.message,
    code: safeError.status >= 500 ? 'ERR_PROMO_SERVICE_FAILED' : 'ERR_PROMO_REQUEST_REJECTED',
    details: safeError.details,
  });
};

const requestIdempotencyKey = (req: Request) => {
  const headerValue = req.headers['x-idempotency-key'];
  if (typeof headerValue === 'string' && headerValue.trim()) return headerValue.trim();
  if (Array.isArray(headerValue) && headerValue[0]?.trim()) return headerValue[0].trim();
  if (typeof resLocalIdempotency(req) === 'string') return String(resLocalIdempotency(req));
  return typeof req.body?.idempotency_key === 'string' ? req.body.idempotency_key : undefined;
};

const resLocalIdempotency = (req: Request) => (req.res?.locals as any)?.idempotencyKey;

export const listAdminPromoCampaigns = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaigns = await listPromoCampaigns({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      service_code: typeof req.query.service_code === 'string' ? req.query.service_code : undefined,
      limit: req.query.limit,
    });
    res.json({ success: true, data: campaigns });
  } catch (error) {
    respondError(res, error);
  }
};

export const getAdminPromoCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = await getPromoCampaignById(String(req.params.id || ''));
    if (!campaign) {
      res.status(404).json({ success: false, data: null, message: 'Promo campaign not found', code: 'ERR_PROMO_NOT_FOUND' });
      return;
    }
    res.json({ success: true, data: campaign });
  } catch (error) {
    respondError(res, error);
  }
};

export const getAdminPromoMarginPolicies = async (_req: Request, res: Response): Promise<void> => {
  try {
    const policies = await getPromoMarginPolicies();
    res.json({ success: true, data: policies });
  } catch (error) {
    respondError(res, error);
  }
};

export const getAdminPromoCampaignAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const analytics = await getPromoCampaignAnalytics(String(req.params.id || ''));
    res.json({ success: true, data: analytics });
  } catch (error) {
    respondError(res, error);
  }
};

export const createAdminPromoCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = await createPromoCampaign(req.user || {}, req.body || {});
    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    respondError(res, error);
  }
};

export const updateAdminPromoCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = await updatePromoCampaign(req.user || {}, String(req.params.id || ''), req.body || {});
    res.json({ success: true, data: campaign });
  } catch (error) {
    respondError(res, error);
  }
};

export const submitAdminPromoCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = await submitPromoCampaignForApproval(req.user || {}, String(req.params.id || ''));
    res.json({ success: true, data: campaign });
  } catch (error) {
    respondError(res, error);
  }
};

export const approveAdminPromoCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = await approvePromoCampaign(req.user || {}, String(req.params.id || ''));
    res.json({ success: true, data: campaign });
  } catch (error) {
    respondError(res, error);
  }
};

export const publishAdminPromoCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = await publishPromoCampaign(req.user || {}, String(req.params.id || ''));
    res.json({ success: true, data: campaign });
  } catch (error) {
    respondError(res, error);
  }
};

export const pauseAdminPromoCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = await pausePromoCampaign(
      req.user || {},
      String(req.params.id || ''),
      typeof req.body?.reason === 'string' ? req.body.reason : 'Paused from admin console',
    );
    res.json({ success: true, data: campaign });
  } catch (error) {
    respondError(res, error);
  }
};

export const simulateAdminPromoCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await validatePromoForCheckout(String(getActorId(req)), req.body || {}, 'quote');
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error);
  }
};

export const previewAdminPromoNotificationAudience = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await previewPromoNotificationAudience(String(req.params.id || ''), req.body || {});
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error);
  }
};

export const notifyAdminPromoCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await sendPromoCampaignNotification(req.user || {}, String(req.params.id || ''), req.body || {});
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error);
  }
};

export const validateCustomerPromo = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
      return;
    }
    const result = await validatePromoForCheckout(req.user.id, req.body || {}, 'quote');
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error);
  }
};

export const listCustomerEligiblePromos = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
      return;
    }
    const campaigns = await listPromoCampaigns({
      status: 'active',
      service_code: typeof req.query.service_code === 'string' ? req.query.service_code : undefined,
      limit: req.query.limit || 20,
    });
    const publicCampaigns = campaigns.map((campaign: any) => ({
      id: campaign.id,
      code: campaign.code,
      name: campaign.name,
      description: campaign.description,
      discount_type: campaign.discount_type,
      discount_value_idr: campaign.discount_value_idr,
      discount_percent: campaign.discount_percent,
      max_discount_idr: campaign.max_discount_idr,
      min_order_idr: campaign.min_order_idr,
      service_codes: campaign.service_codes,
      starts_at: campaign.starts_at,
      ends_at: campaign.ends_at,
    }));
    res.json({ success: true, data: publicCampaigns });
  } catch (error) {
    respondError(res, error);
  }
};

export const validateCustomerWebPromo = validateCustomerPromo;

export const reserveCustomerPromo = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
      return;
    }
    const result = await validatePromoForCheckout(req.user.id, {
      ...(req.body || {}),
      idempotency_key: requestIdempotencyKey(req),
    }, 'reserve');
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error);
  }
};

export const redeemCustomerPromo = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
      return;
    }
    const result = await validatePromoForCheckout(req.user.id, {
      ...(req.body || {}),
      idempotency_key: requestIdempotencyKey(req),
    }, 'redeem');
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error);
  }
};

export const releaseCustomerPromoReservation = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
      return;
    }
    const result = await releasePromoReservation(req.user.id, String(requestIdempotencyKey(req) || ''));
    res.json({ success: true, data: result });
  } catch (error) {
    respondError(res, error);
  }
};
