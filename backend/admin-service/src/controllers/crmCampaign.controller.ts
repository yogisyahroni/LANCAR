import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';
import { dispatchCrmCampaign, getCrmCampaignMetrics, previewCrmCampaign, recordCrmCampaignConversion } from '../services/crmCampaign.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const internalKeyMatches = (req: Request) => {
  const expected = String(process.env.INTERNAL_API_KEY || '').trim();
  const provided = String(req.header('x-internal-api-key') || '').trim();
  return Boolean(expected && provided && expected.length === provided.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided)));
};

export const dispatchAdminCrmCampaign = async (req: Request, res: Response): Promise<void> => {
  const campaignId = String(req.params.id || '').trim();
  if (!UUID_PATTERN.test(campaignId)) {
    res.status(400).json({ success: false, error: 'Invalid campaign id' });
    return;
  }
  try {
    const stats = await dispatchCrmCampaign(campaignId, {
      templateKey: String(req.body?.template_key || '').trim(),
      locale: String(req.body?.locale || 'id-ID').trim(),
      variables: req.body?.variables,
      limit: Number(req.body?.limit || 500),
    });
    securityLog.info('crm_campaign_dispatched', { campaign_id: campaignId, actor_id: getActorId(req), ...stats });
    res.status(202).json({ success: true, data: { campaign_id: campaignId, ...stats } });
  } catch (error: any) {
    securityLog.error('crm_campaign_dispatch_failed', { campaign_id: campaignId, error: error?.message });
    res.status(Number(error?.statusCode) || 500).json({ success: false, error: error?.message || 'Campaign dispatch failed' });
  }
};

export const previewAdminCrmCampaign = async (req: Request, res: Response): Promise<void> => {
  const campaignId = String(req.params.id || '').trim();
  if (!UUID_PATTERN.test(campaignId)) {
    res.status(400).json({ success: false, error: 'Invalid campaign id' });
    return;
  }
  try {
    res.json({ success: true, data: await previewCrmCampaign(campaignId) });
  } catch (error: any) {
    securityLog.error('crm_campaign_preview_failed', { campaign_id: campaignId, error: error?.message });
    res.status(Number(error?.statusCode) || 500).json({ success: false, error: error?.message || 'Campaign preview unavailable' });
  }
};

export const getAdminCrmCampaignMetrics = async (req: Request, res: Response): Promise<void> => {
  const campaignId = String(req.params.id || '').trim();
  if (!UUID_PATTERN.test(campaignId)) {
    res.status(400).json({ success: false, error: 'Invalid campaign id' });
    return;
  }
  try {
    res.json({ success: true, data: await getCrmCampaignMetrics(campaignId) });
  } catch (error: any) {
    securityLog.error('crm_campaign_metrics_failed', { campaign_id: campaignId, error: error?.message });
    res.status(Number(error?.statusCode) || 500).json({ success: false, error: error?.message || 'Campaign metrics unavailable' });
  }
};

export const recordInternalCrmCampaignConversion = async (req: Request, res: Response): Promise<void> => {
  if (!internalKeyMatches(req)) {
    res.status(401).json({ success: false, code: 'ERR_INTERNAL_UNAUTHORIZED' });
    return;
  }
  const campaignId = String(req.params.id || '').trim();
  const customerId = String(req.body?.customer_id || '').trim();
  const orderId = String(req.body?.order_id || '').trim();
  if (!UUID_PATTERN.test(campaignId) || !UUID_PATTERN.test(customerId) || !UUID_PATTERN.test(orderId)) {
    res.status(400).json({ success: false, error: 'campaign, customer and order ids are required' });
    return;
  }
  try {
    const recorded = await recordCrmCampaignConversion(campaignId, customerId, orderId);
    res.json({ success: true, data: { recorded } });
  } catch (error: any) {
    securityLog.error('crm_campaign_conversion_failed', { campaign_id: campaignId, error: error?.message });
    res.status(500).json({ success: false, error: 'Campaign conversion unavailable' });
  }
};
