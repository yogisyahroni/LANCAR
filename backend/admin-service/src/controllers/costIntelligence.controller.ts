import { Request, Response } from 'express';
import { getActorId } from '../utils/authUtils';
import { z } from 'zod';
import { CostIntelligenceService } from '../services/costIntelligence.service';

const costConfigSchema = z.object({
  period_label: z.string().min(1).max(100),
  period_start: z.string().transform(v => String(v).slice(0, 10)),
  period_end: z.string().transform(v => String(v).slice(0, 10)),
  capex_total_idr: z.coerce.number().int().nonnegative().optional(),
  capex_amort_months: z.coerce.number().int().positive().optional(),
  opex_server_idr: z.coerce.number().int().nonnegative().optional(),
  opex_domain_ssl_idr: z.coerce.number().int().nonnegative().optional(),
  opex_marketing_idr: z.coerce.number().int().nonnegative().optional(),
  opex_team_salary_idr: z.coerce.number().int().nonnegative().optional(),
  opex_insurance_idr: z.coerce.number().int().nonnegative().optional(),
  opex_other_fixed_idr: z.coerce.number().int().nonnegative().optional(),
  opex_tomtom_per_order_idr: z.coerce.number().nonnegative().optional(),
  opex_zenziva_per_order_idr: z.coerce.number().nonnegative().optional(),
  opex_cloud_storage_per_order_idr: z.coerce.number().nonnegative().optional(),
  opex_cs_support_per_order_idr: z.coerce.number().nonnegative().optional(),
  opex_dispute_reserve_idr: z.coerce.number().nonnegative().optional(),
  tax_vat_pct: z.coerce.number().nonnegative().optional(),
  tax_pph_pct: z.coerce.number().nonnegative().optional(),
  payment_gateway_mdr_pct: z.coerce.number().nonnegative().optional(),
  payment_gateway_fixed_idr: z.coerce.number().nonnegative().optional(),
  payout_disbursement_fee_idr: z.coerce.number().nonnegative().optional(),
  min_platform_fee_idr: z.coerce.number().nonnegative().optional(),
  max_discount_subsidy_pct: z.coerce.number().nonnegative().optional(),
  estimated_orders_per_month: z.coerce.number().positive().optional(),
  target_margin_ondemand_pct: z.coerce.number().optional(),
  target_margin_aggregator_pct: z.coerce.number().optional(),
  notes: z.string().optional(),
});

export const listCostConfigs = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const configs = await CostIntelligenceService.listConfigs(status);
    res.json({ data: configs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getCostConfig = async (req: Request, res: Response) => {
  try {
    const config = await CostIntelligenceService.getConfigById(String(req.params.id));
    if (!config) return res.status(404).json({ error: 'Config not found' });
    res.json({ data: config });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getActiveCostConfig = async (req: Request, res: Response) => {
  try {
    const config = await CostIntelligenceService.getActiveConfig();
    res.json({ data: config });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createCostConfig = async (req: Request, res: Response) => {
  try {
    const data = costConfigSchema.parse(req.body);
    const userId = getActorId(req);
    const created = await CostIntelligenceService.createDraftConfig(data as any, userId);
    res.status(201).json({ data: created });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    res.status(500).json({ error: error.message });
  }
};

export const updateCostConfig = async (req: Request, res: Response) => {
  try {
    const data = costConfigSchema.partial().parse(req.body);
    const updated = await CostIntelligenceService.updateConfig(String(req.params.id), data as any);
    if (!updated) return res.status(404).json({ error: 'Config not found' });
    res.json({ data: updated });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    res.status(500).json({ error: error.message });
  }
};

export const activateCostConfig = async (req: Request, res: Response) => {
  try {
    const userId = getActorId(req);
    const activated = await CostIntelligenceService.activateConfig(String(req.params.id), userId);
    if (!activated) return res.status(404).json({ error: 'Config not found' });
    res.json({ data: activated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getCostBreakdown = async (req: Request, res: Response) => {
  try {
    const breakdown = await CostIntelligenceService.calculateBreakdown(String(req.params.id));
    if (!breakdown) return res.status(404).json({ error: 'Config not found' });
    res.json({ data: breakdown });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const generateRecommendation = async (req: Request, res: Response) => {
  try {
    const userId = getActorId(req);
    const rec = await CostIntelligenceService.generatePricingRecommendation(String(req.params.id), userId);
    if (!rec) return res.status(404).json({ error: 'Failed to generate recommendation' });
    res.status(201).json({ data: rec });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const listRecommendations = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const recs = await CostIntelligenceService.listRecommendations(status);
    res.json({ data: recs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const approveRecommendation = async (req: Request, res: Response) => {
  try {
    const userId = getActorId(req);
    const rec = await CostIntelligenceService.approveRecommendation(String(req.params.id), userId);
    if (!rec) return res.status(404).json({ error: 'Recommendation not found or not pending' });
    res.json({ data: rec });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const rejectRecommendation = async (req: Request, res: Response) => {
  try {
    const { reason } = req.body || {};
    const userId = getActorId(req);
    const rec = await CostIntelligenceService.rejectRecommendation(String(req.params.id), userId, reason || 'Rejected by admin');
    if (!rec) return res.status(404).json({ error: 'Recommendation not found' });
    res.json({ data: rec });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
