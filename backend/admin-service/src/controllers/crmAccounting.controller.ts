import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';
import { reconcileCrmCampaignReservation, reconcileLoyaltyAccount, reconcileReferralRewardBudget, reserveCrmCampaignReservation } from '../services/crmAccounting.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const internalKeyMatches = (req: Request) => {
  const expected = String(process.env.INTERNAL_API_KEY || '').trim();
  const provided = String(req.header('x-internal-api-key') || '').trim();
  if (!expected || !provided || expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
};

/** Order-service writes the CRM reservation projection after authoritative pricing. */
export const reserveInternalCrmCampaignReservation = async (req: Request, res: Response): Promise<void> => {
  if (!internalKeyMatches(req)) {
    res.status(401).json({ success: false, code: 'ERR_INTERNAL_UNAUTHORIZED' });
    return;
  }
  const campaignId = String(req.params.campaignId || '').trim();
  const orderId = String(req.params.orderId || '').trim();
  const idempotencyKey = String(req.header('x-idempotency-key') || '').trim().slice(0, 180);
  if (!UUID_PATTERN.test(campaignId) || !UUID_PATTERN.test(orderId) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,179}$/.test(idempotencyKey)) {
    res.status(400).json({ success: false, code: 'ERR_INVALID_CRM_RESERVATION' });
    return;
  }
  try {
    const result = await reserveCrmCampaignReservation(campaignId, orderId, req.body?.funding_breakdown, idempotencyKey);
    res.status(result.duplicate ? 200 : 201).json({ success: true, data: result });
  } catch (error: any) {
    securityLog.error('internal_crm_reservation_failed', { campaign_id: campaignId, order_id: orderId, error: error?.message });
    res.status(Number(error?.statusCode) || 500).json({ success: false, error: error?.message || 'CRM reservation unavailable' });
  }
};

/** Finance/Ops reconciliation reads the canonical order subsidy and records any mismatch. */
export const reconcileAdminCrmCampaignReservation = async (req: Request, res: Response): Promise<void> => {
  const reservationId = String(req.params.id || '').trim();
  const settlementReference = String(req.body?.settlement_reference || '').trim().slice(0, 128);
  if (!UUID_PATTERN.test(reservationId) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(settlementReference)) {
    res.status(400).json({ success: false, code: 'ERR_INVALID_CRM_RESERVATION_RECONCILIATION' });
    return;
  }
  try {
    const result = await reconcileCrmCampaignReservation(reservationId, getActorId(req), settlementReference);
    res.json({ success: true, data: result });
  } catch (error: any) {
    securityLog.error('admin_crm_reservation_reconciliation_failed', { reservation_id: reservationId, error: error?.message });
    res.status(Number(error?.statusCode) || 500).json({ success: false, error: error?.message || 'CRM reservation reconciliation failed' });
  }
};

export const reconcileAdminLoyaltyAccount = async (req: Request, res: Response): Promise<void> => {
  const accountId = String(req.params.accountId || '').trim();
  if (!UUID_PATTERN.test(accountId)) {
    res.status(400).json({ success: false, code: 'ERR_INVALID_LOYALTY_RECONCILIATION' });
    return;
  }
  try {
    res.json({ success: true, data: await reconcileLoyaltyAccount(accountId, getActorId(req)) });
  } catch (error: any) {
    securityLog.error('admin_loyalty_reconciliation_failed', { account_id: accountId, error: error?.message });
    res.status(Number(error?.statusCode) || 500).json({ success: false, error: error?.message || 'Loyalty reconciliation failed' });
  }
};

export const reconcileAdminReferralRewardBudget = async (req: Request, res: Response): Promise<void> => {
  const marketCode = String(req.body?.market_code || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(marketCode)) {
    res.status(400).json({ success: false, code: 'ERR_INVALID_REFERRAL_BUDGET_RECONCILIATION' });
    return;
  }
  try {
    res.json({ success: true, data: await reconcileReferralRewardBudget(marketCode, getActorId(req)) });
  } catch (error: any) {
    securityLog.error('admin_referral_reward_budget_reconciliation_failed', { market_code: marketCode, error: error?.message });
    res.status(Number(error?.statusCode) || 500).json({ success: false, error: error?.message || 'Referral reward budget reconciliation failed' });
  }
};
