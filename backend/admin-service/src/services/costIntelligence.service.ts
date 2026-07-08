import { db, readDb } from '../db';

export interface PlatformCostConfig {
  id: string;
  period_label: string;
  period_start: string;
  period_end: string;
  status: 'draft' | 'active' | 'archived';
  capex_total_idr: number;
  capex_amort_months: number;
  capex_monthly_idr: number;
  opex_server_idr: number;
  opex_domain_ssl_idr: number;
  opex_marketing_idr: number;
  opex_team_salary_idr: number;
  opex_insurance_idr: number;
  opex_other_fixed_idr: number;
  opex_tomtom_per_order_idr: number;
  opex_zenziva_per_order_idr: number;
  opex_cloud_storage_per_order_idr: number;
  opex_cs_support_per_order_idr: number;
  opex_dispute_reserve_idr: number;
  tax_vat_pct: number;
  tax_pph_pct: number;
  payment_gateway_mdr_pct: number;
  payment_gateway_fixed_idr: number;
  payout_disbursement_fee_idr: number;
  min_platform_fee_idr: number;
  max_discount_subsidy_pct: number;
  estimated_orders_per_month: number;
  target_margin_ondemand_pct: number;
  target_margin_aggregator_pct: number;
  notes?: string;
  created_by?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CostBreakdown {
  config: PlatformCostConfig;
  totalFixedCostPerMonth: number;
  totalVariableCostPerOrder: number;
  fixedCostPerOrder: number;
  totalPlatformCostPerOrder: number;
  actuals: {
    totalOrders: number;
    ondemandOrders: number;
    aggregatorOrders: number;
    totalRevenueIdr: number;
    totalMdrCostIdr: number;
    totalPlatformFeeIdr: number;
    actualAvgRevenuePerOrder: number;
    actualAvgMdrPerOrder: number;
    actualGrossMarginIdr: number;
    actualGrossMarginPct: number;
  };
  breakEven: {
    breakEvenOrdersPerMonth: number;
    breakEvenOrdersPerDay: number;
    paybackPeriodMonths?: number;
    isProfitableActual: boolean;
  };
}

export interface PricingRecommendationItem {
  id: string;
  cost_config_id: string;
  platform_cost_per_order_idr: number;
  ondemand_base_fee_recommended_idr: number;
  ondemand_per_km_fee_recommended_idr: number;
  ondemand_current_base_fee_idr: number;
  ondemand_current_per_km_fee_idr: number;
  aggregator_handling_fee_recommended_idr: number;
  aggregator_margin_pct_recommended: number;
  aggregator_current_handling_fee_idr: number;
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  rejection_reason?: string;
  generated_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  applied_at?: string;
  applied_pricing_config_id?: string;
}

export class CostIntelligenceService {
  static async listConfigs(status?: string): Promise<PlatformCostConfig[]> {
    const client = await readDb.connect();
    try {
      let query = 'SELECT * FROM platform_cost_configs';
      const params: any[] = [];
      if (status) {
        query += ' WHERE status = $1';
        params.push(status);
      }
      query += ' ORDER BY period_start DESC, created_at DESC';
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  static async getConfigById(id: string): Promise<PlatformCostConfig | null> {
    const client = await readDb.connect();
    try {
      const result = await client.query('SELECT * FROM platform_cost_configs WHERE id = $1', [id]);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  static async getActiveConfig(): Promise<PlatformCostConfig | null> {
    const client = await readDb.connect();
    try {
      const result = await client.query("SELECT * FROM platform_cost_configs WHERE status = 'active' LIMIT 1");
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  static async createDraftConfig(data: Partial<PlatformCostConfig>, userId: string): Promise<PlatformCostConfig> {
    const client = await db.connect();
    try {
      const result = await client.query(
        `INSERT INTO platform_cost_configs (
          period_label, period_start, period_end, status,
          capex_total_idr, capex_amort_months,
          opex_server_idr, opex_domain_ssl_idr, opex_marketing_idr,
          opex_team_salary_idr, opex_insurance_idr, opex_other_fixed_idr,
          opex_tomtom_per_order_idr, opex_zenziva_per_order_idr,
          opex_cloud_storage_per_order_idr, opex_cs_support_per_order_idr, opex_dispute_reserve_idr,
          tax_vat_pct, tax_pph_pct,
          payment_gateway_mdr_pct, payment_gateway_fixed_idr, payout_disbursement_fee_idr,
          min_platform_fee_idr, max_discount_subsidy_pct,
          estimated_orders_per_month, target_margin_ondemand_pct, target_margin_aggregator_pct,
          notes, created_by
        ) VALUES (
          $1, $2, $3, 'draft',
          $4, $5,
          $6, $7, $8,
          $9, $10, $11,
          $12, $13,
          $14, $15, $16,
          $17, $18,
          $19, $20, $21,
          $22, $23,
          $24, $25, $26,
          $27, $28
        ) RETURNING *`,
        [
          data.period_label,
          data.period_start,
          data.period_end,
          data.capex_total_idr || 0,
          data.capex_amort_months || 24,
          data.opex_server_idr || 0,
          data.opex_domain_ssl_idr || 0,
          data.opex_marketing_idr || 0,
          data.opex_team_salary_idr || 0,
          data.opex_insurance_idr || 0,
          data.opex_other_fixed_idr || 0,
          data.opex_tomtom_per_order_idr || 0,
          data.opex_zenziva_per_order_idr || 0,
          data.opex_cloud_storage_per_order_idr || 50,
          data.opex_cs_support_per_order_idr || 150,
          data.opex_dispute_reserve_idr || 200,
          data.tax_vat_pct || 11.0,
          data.tax_pph_pct || 2.0,
          data.payment_gateway_mdr_pct || 0.7,
          data.payment_gateway_fixed_idr || 2000,
          data.payout_disbursement_fee_idr || 2500,
          data.min_platform_fee_idr || 1500,
          data.max_discount_subsidy_pct || 20.0,
          data.estimated_orders_per_month || 1000,
          data.target_margin_ondemand_pct || 20.0,
          data.target_margin_aggregator_pct || 15.0,
          data.notes || null,
          userId,
        ]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  static async updateConfig(id: string, data: Partial<PlatformCostConfig>): Promise<PlatformCostConfig | null> {
    const client = await db.connect();
    try {
      const existing = await client.query('SELECT status FROM platform_cost_configs WHERE id = $1', [id]);
      if (existing.rows.length === 0) return null;

      const result = await client.query(
        `UPDATE platform_cost_configs SET
          period_label = COALESCE($2, period_label),
          period_start = COALESCE($3, period_start),
          period_end = COALESCE($4, period_end),
          capex_total_idr = COALESCE($5, capex_total_idr),
          capex_amort_months = COALESCE($6, capex_amort_months),
          opex_server_idr = COALESCE($7, opex_server_idr),
          opex_domain_ssl_idr = COALESCE($8, opex_domain_ssl_idr),
          opex_marketing_idr = COALESCE($9, opex_marketing_idr),
          opex_team_salary_idr = COALESCE($10, opex_team_salary_idr),
          opex_insurance_idr = COALESCE($11, opex_insurance_idr),
          opex_other_fixed_idr = COALESCE($12, opex_other_fixed_idr),
          opex_tomtom_per_order_idr = COALESCE($13, opex_tomtom_per_order_idr),
          opex_zenziva_per_order_idr = COALESCE($14, opex_zenziva_per_order_idr),
          opex_cloud_storage_per_order_idr = COALESCE($15, opex_cloud_storage_per_order_idr),
          opex_cs_support_per_order_idr = COALESCE($16, opex_cs_support_per_order_idr),
          opex_dispute_reserve_idr = COALESCE($17, opex_dispute_reserve_idr),
          tax_vat_pct = COALESCE($18, tax_vat_pct),
          tax_pph_pct = COALESCE($19, tax_pph_pct),
          payment_gateway_mdr_pct = COALESCE($20, payment_gateway_mdr_pct),
          payment_gateway_fixed_idr = COALESCE($21, payment_gateway_fixed_idr),
          payout_disbursement_fee_idr = COALESCE($22, payout_disbursement_fee_idr),
          min_platform_fee_idr = COALESCE($23, min_platform_fee_idr),
          max_discount_subsidy_pct = COALESCE($24, max_discount_subsidy_pct),
          estimated_orders_per_month = COALESCE($25, estimated_orders_per_month),
          target_margin_ondemand_pct = COALESCE($26, target_margin_ondemand_pct),
          target_margin_aggregator_pct = COALESCE($27, target_margin_aggregator_pct),
          notes = COALESCE($28, notes),
          updated_at = NOW()
        WHERE id = $1 RETURNING *`,
        [
          id,
          data.period_label,
          data.period_start,
          data.period_end,
          data.capex_total_idr,
          data.capex_amort_months,
          data.opex_server_idr,
          data.opex_domain_ssl_idr,
          data.opex_marketing_idr,
          data.opex_team_salary_idr,
          data.opex_insurance_idr,
          data.opex_other_fixed_idr,
          data.opex_tomtom_per_order_idr,
          data.opex_zenziva_per_order_idr,
          data.opex_cloud_storage_per_order_idr,
          data.opex_cs_support_per_order_idr,
          data.opex_dispute_reserve_idr,
          data.tax_vat_pct,
          data.tax_pph_pct,
          data.payment_gateway_mdr_pct,
          data.payment_gateway_fixed_idr,
          data.payout_disbursement_fee_idr,
          data.min_platform_fee_idr,
          data.max_discount_subsidy_pct,
          data.estimated_orders_per_month,
          data.target_margin_ondemand_pct,
          data.target_margin_aggregator_pct,
          data.notes,
        ]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  static async activateConfig(id: string, superAdminId: string): Promise<PlatformCostConfig | null> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE platform_cost_configs SET status = 'archived' WHERE status = 'active'");
      const result = await client.query(
        `UPDATE platform_cost_configs
         SET status = 'active', approved_by = $2, approved_at = NOW(), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, superAdminId]
      );
      await client.query('COMMIT');
      return result.rows[0] || null;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async calculateBreakdown(configId: string): Promise<CostBreakdown | null> {
    const config = await this.getConfigById(configId);
    if (!config) return null;

    const capexMonthly = Number(config.capex_monthly_idr || 0);
    const totalFixedCostPerMonth =
      capexMonthly +
      Number(config.opex_server_idr || 0) +
      Number(config.opex_domain_ssl_idr || 0) +
      Number(config.opex_marketing_idr || 0) +
      Number(config.opex_team_salary_idr || 0) +
      Number(config.opex_insurance_idr || 0) +
      Number(config.opex_other_fixed_idr || 0);

    const totalVariableCostPerOrder =
      Number(config.opex_tomtom_per_order_idr || 0) +
      Number(config.opex_zenziva_per_order_idr || 0) +
      Number(config.opex_cloud_storage_per_order_idr || 0) +
      Number(config.opex_cs_support_per_order_idr || 0) +
      Number(config.opex_dispute_reserve_idr || 0) +
      Number(config.payment_gateway_fixed_idr || 0) +
      Number(config.payout_disbursement_fee_idr || 0);

    const estOrders = Math.max(1, Number(config.estimated_orders_per_month || 1000));
    const fixedCostPerOrder = Math.round(totalFixedCostPerMonth / estOrders);
    const totalPlatformCostPerOrder = fixedCostPerOrder + totalVariableCostPerOrder;

    const client = await readDb.connect();
    try {
      const actualsRes = await client.query(
        `SELECT
           COUNT(*) AS total_orders,
           COUNT(*) FILTER (WHERE COALESCE(order_type, 'ondemand') = 'ondemand') AS ondemand_orders,
           COUNT(*) FILTER (WHERE order_type = 'aggregator') AS aggregator_orders,
           COALESCE(SUM(total_price_idr), 0) AS total_revenue_idr,
           COALESCE(SUM(mdr_idr), 0) AS total_mdr_cost_idr,
           COALESCE(SUM(platform_fee_idr), 0) AS total_platform_fee_idr
         FROM orders
         WHERE created_at >= $1::timestamp AND created_at <= $2::timestamp
           AND status NOT IN ('cancelled', 'failed')`,
        [config.period_start, config.period_end]
      );

      const row = actualsRes.rows[0] || {};
      const totalOrders = Number(row.total_orders || 0);
      const ondemandOrders = Number(row.ondemand_orders || 0);
      const aggregatorOrders = Number(row.aggregator_orders || 0);
      const totalRevenueIdr = Number(row.total_revenue_idr || 0);
      const totalMdrCostIdr = Number(row.total_mdr_cost_idr || 0);
      const totalPlatformFeeIdr = Number(row.total_platform_fee_idr || 0);

      const actualAvgRevenuePerOrder = totalOrders > 0 ? Math.round(totalRevenueIdr / totalOrders) : 0;
      const actualAvgMdrPerOrder = totalOrders > 0 ? Math.round(totalMdrCostIdr / totalOrders) : 0;
      const actualTotalCost = totalFixedCostPerMonth + (totalOrders * totalVariableCostPerOrder) + totalMdrCostIdr;
      const actualGrossMarginIdr = totalRevenueIdr - actualTotalCost;
      const actualGrossMarginPct = totalRevenueIdr > 0 ? Number(((actualGrossMarginIdr / totalRevenueIdr) * 100).toFixed(2)) : 0;

      // BEP calculation
      const marginContributionPerOrder = actualAvgRevenuePerOrder - totalVariableCostPerOrder - actualAvgMdrPerOrder;
      const breakEvenOrdersPerMonth = marginContributionPerOrder > 0
        ? Math.ceil(totalFixedCostPerMonth / marginContributionPerOrder)
        : 0;
      const breakEvenOrdersPerDay = Math.ceil(breakEvenOrdersPerMonth / 30);

      const capexTotal = Number(config.capex_total_idr || 0);
      const paybackPeriodMonths = actualGrossMarginIdr > 0
        ? Number(((capexTotal + totalFixedCostPerMonth) / actualGrossMarginIdr).toFixed(1))
        : 0;

      return {
        config,
        totalFixedCostPerMonth,
        totalVariableCostPerOrder,
        fixedCostPerOrder,
        totalPlatformCostPerOrder,
        actuals: {
          totalOrders,
          ondemandOrders,
          aggregatorOrders,
          totalRevenueIdr,
          totalMdrCostIdr,
          totalPlatformFeeIdr,
          actualAvgRevenuePerOrder,
          actualAvgMdrPerOrder,
          actualGrossMarginIdr,
          actualGrossMarginPct,
        },
        breakEven: {
          breakEvenOrdersPerMonth,
          breakEvenOrdersPerDay,
          paybackPeriodMonths,
          isProfitableActual: actualGrossMarginIdr > 0,
        },
      };
    } finally {
      client.release();
    }
  }

  static async generatePricingRecommendation(configId: string, superAdminId: string): Promise<PricingRecommendationItem | null> {
    const breakdown = await this.calculateBreakdown(configId);
    if (!breakdown) return null;

    const { config, totalPlatformCostPerOrder } = breakdown;

    const client = await db.connect();
    try {
      // Current pricing snapshots
      const pricingRes = await client.query(
        "SELECT base_fee, per_km_fee FROM pricing_configs WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1"
      );
      const currentPricing = pricingRes.rows[0] || { base_fee: 5000, per_km_fee: 2500 };

      // Impact of VAT (PPN) & MDR on Net Platform Fee
      const vatPct = Number(config.tax_vat_pct || 11) / 100;
      const mdrPct = Number(config.payment_gateway_mdr_pct || 0.7) / 100;
      const minFee = Number(config.min_platform_fee_idr || 1500);

      // Recommended On-Demand fees considering VAT & MDR deduction
      const targetOndemandMargin = Number(config.target_margin_ondemand_pct || 20) / 100;
      const effectiveDenominatorOndemand = Math.max(0.3, 1 - targetOndemandMargin - vatPct - mdrPct);
      const targetOndemandRevenue = Math.max(
        minFee,
        Math.round(totalPlatformCostPerOrder / effectiveDenominatorOndemand)
      );

      // Allocate 60% to base fee, 40% to per_km assuming avg 5km
      const ondemandBaseFeeRec = Math.max(minFee, Math.round(targetOndemandRevenue * 0.6));
      const ondemandPerKmFeeRec = Math.max(1000, Math.round((targetOndemandRevenue * 0.4) / 5));

      // Recommended Aggregator handling fee considering VAT & MDR deduction
      const targetAggregatorMargin = Number(config.target_margin_aggregator_pct || 15) / 100;
      const effectiveDenominatorAgg = Math.max(0.3, 1 - targetAggregatorMargin - vatPct - mdrPct);
      const aggregatorHandlingFeeRec = Math.max(
        minFee,
        Math.round(totalPlatformCostPerOrder / effectiveDenominatorAgg)
      );

      const result = await client.query(
        `INSERT INTO pricing_recommendations (
          cost_config_id,
          platform_cost_per_order_idr,
          ondemand_base_fee_recommended_idr,
          ondemand_per_km_fee_recommended_idr,
          ondemand_current_base_fee_idr,
          ondemand_current_per_km_fee_idr,
          aggregator_handling_fee_recommended_idr,
          aggregator_margin_pct_recommended,
          aggregator_current_handling_fee_idr,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
        RETURNING *`,
        [
          config.id,
          totalPlatformCostPerOrder,
          ondemandBaseFeeRec,
          ondemandPerKmFeeRec,
          currentPricing.base_fee,
          currentPricing.per_km_fee,
          aggregatorHandlingFeeRec,
          config.target_margin_aggregator_pct,
          3000, // default current aggregator handling fee
        ]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  static async listRecommendations(status?: string): Promise<PricingRecommendationItem[]> {
    const client = await readDb.connect();
    try {
      let query = 'SELECT * FROM pricing_recommendations';
      const params: any[] = [];
      if (status) {
        query += ' WHERE status = $1';
        params.push(status);
      }
      query += ' ORDER BY generated_at DESC';
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  static async approveRecommendation(id: string, superAdminId: string): Promise<PricingRecommendationItem | null> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const recRes = await client.query('SELECT * FROM pricing_recommendations WHERE id = $1', [id]);
      if (recRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const rec = recRes.rows[0];

      // Create updated active pricing_config
      await client.query('UPDATE pricing_configs SET is_active = FALSE WHERE is_active = TRUE');
      const newPricing = await client.query(
        `INSERT INTO pricing_configs (model, base_fee, per_km_fee, is_active)
         VALUES ('p2p', $1, $2, TRUE) RETURNING id`,
        [rec.ondemand_base_fee_recommended_idr, rec.ondemand_per_km_fee_recommended_idr]
      );

      const updatedRec = await client.query(
        `UPDATE pricing_recommendations
         SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(), applied_at = NOW(), applied_pricing_config_id = $3
         WHERE id = $1 RETURNING *`,
        [id, superAdminId, newPricing.rows[0].id]
      );

      await client.query('COMMIT');
      return updatedRec.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async rejectRecommendation(id: string, superAdminId: string, reason: string): Promise<PricingRecommendationItem | null> {
    const client = await db.connect();
    try {
      const result = await client.query(
        `UPDATE pricing_recommendations
         SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW(), rejection_reason = $3
         WHERE id = $1 RETURNING *`,
        [id, superAdminId, reason]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }
}
