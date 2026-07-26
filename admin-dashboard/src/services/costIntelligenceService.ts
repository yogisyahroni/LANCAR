import { api } from '../lib/api';

export interface PlatformCostConfig {
  id?: string;
  period_label: string;
  period_start: string;
  period_end: string;
  status?: 'draft' | 'active' | 'archived';
  capex_total_idr: number;
  capex_amort_months: number;
  capex_ondemand_details?: any;
  capex_aggregator_details?: any;
  opex_server_idr: number;
  opex_domain_ssl_idr: number;
  opex_marketing_idr: number;
  opex_team_salary_idr: number;
  opex_insurance_idr: number;
  opex_other_fixed_idr: number;
  opex_tomtom_per_order_idr: number;
  opex_zenziva_per_order_idr: number;
  opex_cloud_storage_per_order_idr?: number;
  opex_cs_support_per_order_idr?: number;
  opex_dispute_reserve_idr?: number;
  opex_ondemand_details?: any;
  opex_aggregator_details?: any;
  tax_vat_pct?: number;
  tax_pph_pct?: number;
  payment_gateway_mdr_pct?: number;
  payment_gateway_fixed_idr?: number;
  payout_disbursement_fee_idr?: number;
  min_platform_fee_idr?: number;
  max_discount_subsidy_pct?: number;
  estimated_orders_per_month: number;
  estimated_orders_ondemand_per_month?: number;
  estimated_orders_aggregator_per_month?: number;
  estimated_users_aggregator_per_month?: number;
  target_margin_ondemand_pct: number;
  target_margin_aggregator_pct: number;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CostBreakdown {
  config_id: string;
  period_label: string;
  fixed_monthly_total_idr: number;
  capex_monthly_amort_idr: number;
  variable_per_order_idr: number;
  estimated_orders_per_month: number;
  total_monthly_cost_idr: number;
  bep_cost_per_order_idr: number;
  target_margin_ondemand_pct: number;
  recommended_ondemand_platform_fee_idr: number;
  target_margin_aggregator_pct: number;
  recommended_aggregator_handling_fee_idr: number;
  actual_orders_this_period?: number;
  actual_revenue_ondemand_idr?: number;
  actual_revenue_aggregator_idr?: number;
  actual_total_revenue_idr?: number;
  actual_variable_cost_idr?: number;
  actual_net_pnl_idr?: number;
}

export interface PricingRecommendation {
  id: string;
  cost_config_id: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  bep_cost_per_order_idr: number;
  recommended_ondemand_platform_fee_idr: number;
  recommended_aggregator_handling_fee_idr: number;
  projected_monthly_revenue_idr: number;
  projected_monthly_profit_idr: number;
  rejection_reason?: string;
  created_at: string;
}

export const CostIntelligenceApi = {
  listConfigs: async (status?: string) => {
    const res = await api.get('/admin/cost-configs', { params: status ? { status } : {} });
    return res.data.data as PlatformCostConfig[];
  },

  getConfig: async (id: string) => {
    const res = await api.get(`/admin/cost-configs/${id}`);
    return res.data.data as PlatformCostConfig;
  },

  getActiveConfig: async () => {
    const res = await api.get('/admin/cost-configs/active');
    return res.data.data as PlatformCostConfig | null;
  },

  createConfig: async (data: Partial<PlatformCostConfig>) => {
    const res = await api.post('/admin/cost-configs', data);
    return res.data.data as PlatformCostConfig;
  },

  updateConfig: async (id: string, data: Partial<PlatformCostConfig>) => {
    const res = await api.put(`/admin/cost-configs/${id}`, data);
    return res.data.data as PlatformCostConfig;
  },

  activateConfig: async (id: string) => {
    const res = await api.post(`/admin/cost-configs/${id}/activate`);
    return res.data.data as PlatformCostConfig;
  },

  getBreakdown: async (id: string) => {
    const res = await api.get(`/admin/cost-configs/${id}/breakdown`);
    return res.data.data as CostBreakdown;
  },

  generateRecommendation: async (id: string) => {
    const res = await api.post(`/admin/cost-configs/${id}/generate-recommendation`);
    return res.data.data as PricingRecommendation;
  },

  listRecommendations: async (status?: string) => {
    const res = await api.get('/admin/pricing-recommendations', { params: status ? { status } : {} });
    return res.data.data as PricingRecommendation[];
  },

  approveRecommendation: async (id: string) => {
    const res = await api.post(`/admin/pricing-recommendations/${id}/approve`);
    return res.data.data as PricingRecommendation;
  },

  rejectRecommendation: async (id: string, reason: string) => {
    const res = await api.post(`/admin/pricing-recommendations/${id}/reject`, { reason });
    return res.data.data as PricingRecommendation;
  },
};
