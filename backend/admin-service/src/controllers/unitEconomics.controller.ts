import { Request, Response } from 'express';
import { readDb } from '../db';
import { securityLog } from '../security/logRedaction';
import {
  calculatePlatformContribution,
  normalizeAmountRow,
  UNIT_ECONOMICS_DEFINITION,
  unitEconomicsBaseCte,
} from '../services/unitEconomics';

const parseWindow = (req: Request): { start: Date; end: Date } => {
  const now = new Date();
  const rawStart = typeof req.query.start_date === 'string' ? req.query.start_date : '';
  const rawEnd = typeof req.query.end_date === 'string' ? req.query.end_date : '';
  const start = rawStart ? new Date(rawStart.length === 10 ? `${rawStart}T00:00:00.000Z` : rawStart) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const end = rawEnd ? new Date(rawEnd.length === 10 ? `${rawEnd}T23:59:59.999Z` : rawEnd) : now;
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw Object.assign(new Error('start_date dan end_date harus berupa window waktu yang valid'), { statusCode: 400 });
  }
  return { start, end };
};

const asNumber = (value: unknown): number => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeSummary = (row: Record<string, unknown>): Record<string, any> => {
  const normalized = normalizeAmountRow(row);
  const customerPaid = asNumber(normalized.customer_paid_idr);
  const contribution = asNumber(normalized.platform_contribution_idr);
  return {
    ...normalized,
    contribution_margin_pct: customerPaid > 0 ? Number(((contribution / customerPaid) * 100).toFixed(2)) : 0,
    average_customer_paid_idr: asNumber(normalized.order_count) > 0 ? Math.round(customerPaid / asNumber(normalized.order_count)) : 0,
  };
};

export const getUnitEconomicsV2 = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start, end } = parseWindow(req);
    const requestedCohort = String(req.query.cohort || 'week').toLowerCase();
    const cohort = ['day', 'week', 'month'].includes(requestedCohort) ? requestedCohort : 'week';
    const requestedLimit = Number.parseInt(String(req.query.outlier_limit || '100'), 10);
    const outlierLimit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100;
    const params = [start, end];
    const cte = unitEconomicsBaseCte(cohort);

    const [summaryResult, cohortResult, outlierResult] = await Promise.all([
      readDb.query(`
        ${cte}
        SELECT
          COUNT(*)::int AS order_count,
          COALESCE(SUM(customer_paid_idr), 0)::bigint AS customer_paid_idr,
          COALESCE(SUM(customer_refund_idr), 0)::bigint AS customer_refund_idr,
          COALESCE(SUM(net_customer_paid_idr), 0)::bigint AS net_customer_paid_idr,
          COALESCE(SUM(tax_idr), 0)::bigint AS tax_idr,
          COALESCE(SUM(provider_fee_idr), 0)::bigint AS provider_fee_idr,
          COALESCE(SUM(promo_subsidy_idr), 0)::bigint AS promo_subsidy_idr,
          COALESCE(SUM(merchant_payable_idr), 0)::bigint AS merchant_payable_idr,
          COALESCE(SUM(courier_payable_idr), 0)::bigint AS courier_payable_idr,
          COALESCE(SUM(carrier_payable_idr), 0)::bigint AS carrier_payable_idr,
          COALESCE(SUM(ads_other_charges_idr), 0)::bigint AS ads_other_charges_idr,
          COALESCE(SUM(platform_contribution_idr), 0)::bigint AS platform_contribution_idr,
          COUNT(*) FILTER (WHERE platform_contribution_idr < 0)::int AS negative_margin_order_count,
          COUNT(*) FILTER (WHERE paid_payment_count = 0)::int AS missing_payment_order_count,
          COUNT(*) FILTER (WHERE has_pricing_snapshot)::int AS pricing_snapshot_order_count,
          COUNT(*) FILTER (WHERE courier_ledger_entry_count > 0)::int AS courier_ledger_order_count,
          COUNT(*) FILTER (WHERE merchant_settlement_count > 0)::int AS merchant_settlement_order_count,
          COUNT(*) FILTER (WHERE provider_invoice_item_count > 0)::int AS provider_invoice_order_count,
          COUNT(*) FILTER (WHERE ads_ledger_entry_count > 0)::int AS ads_ledger_order_count
        FROM calculated_order_facts
      `, params),
      readDb.query(`
        ${cte}
        SELECT
          market_bucket,
          service_bucket,
          order_cohort,
          COUNT(*)::int AS order_count,
          COALESCE(SUM(customer_paid_idr), 0)::bigint AS customer_paid_idr,
          COALESCE(SUM(customer_refund_idr), 0)::bigint AS customer_refund_idr,
          COALESCE(SUM(net_customer_paid_idr), 0)::bigint AS net_customer_paid_idr,
          COALESCE(SUM(tax_idr), 0)::bigint AS tax_idr,
          COALESCE(SUM(provider_fee_idr), 0)::bigint AS provider_fee_idr,
          COALESCE(SUM(promo_subsidy_idr), 0)::bigint AS promo_subsidy_idr,
          COALESCE(SUM(merchant_payable_idr), 0)::bigint AS merchant_payable_idr,
          COALESCE(SUM(courier_payable_idr), 0)::bigint AS courier_payable_idr,
          COALESCE(SUM(carrier_payable_idr), 0)::bigint AS carrier_payable_idr,
          COALESCE(SUM(ads_other_charges_idr), 0)::bigint AS ads_other_charges_idr,
          COALESCE(SUM(platform_contribution_idr), 0)::bigint AS platform_contribution_idr,
          COUNT(*) FILTER (WHERE platform_contribution_idr < 0)::int AS negative_margin_order_count,
          COUNT(*) FILTER (WHERE paid_payment_count = 0)::int AS missing_payment_order_count,
          COUNT(*) FILTER (WHERE has_pricing_snapshot)::int AS pricing_snapshot_order_count
        FROM calculated_order_facts
        GROUP BY market_bucket, service_bucket, order_cohort
        ORDER BY order_cohort DESC, platform_contribution_idr ASC
      `, params),
      readDb.query(`
        ${cte}
        SELECT
          order_id,
          order_number,
          market_bucket,
          service_bucket,
          order_cohort,
          financial_at,
          customer_paid_idr,
          customer_refund_idr,
          net_customer_paid_idr,
          tax_idr,
          provider_fee_idr,
          promo_subsidy_idr,
          merchant_payable_idr,
          courier_payable_idr,
          carrier_payable_idr,
          ads_other_charges_idr,
          platform_contribution_idr,
          pricing_rule_version,
          pricing_policy_version,
          merchant_contract_version,
          pricing_components,
          merchant_payable_source,
          courier_payable_source,
          carrier_payable_source,
          ads_other_charges_source
        FROM calculated_order_facts
        WHERE platform_contribution_idr < 0
        ORDER BY platform_contribution_idr ASC, financial_at DESC
        LIMIT $3
      `, [...params, outlierLimit]),
    ]);

    const summary = normalizeSummary(summaryResult.rows[0] || {});
    const cohorts = cohortResult.rows.map((row) => normalizeSummary(row));
    const outliers = outlierResult.rows.map((row) => normalizeAmountRow(row));
    const coverage = {
      order_count: asNumber(summary.order_count),
      paid_payment_orders: asNumber(summary.order_count) - asNumber(summary.missing_payment_order_count),
      missing_payment_orders: asNumber(summary.missing_payment_order_count),
      pricing_snapshot_orders: asNumber(summary.pricing_snapshot_order_count),
      courier_ledger_orders: asNumber(summary.courier_ledger_order_count),
      merchant_settlement_orders: asNumber(summary.merchant_settlement_order_count),
      provider_invoice_orders: asNumber(summary.provider_invoice_order_count),
      ads_ledger_orders: asNumber(summary.ads_ledger_order_count),
      reconciliation_status: asNumber(summary.missing_payment_order_count) > 0 ? 'incomplete' : 'complete',
      reconciliation_reason: asNumber(summary.missing_payment_order_count) > 0
        ? 'One or more realized orders have no verified successful payment fact.'
        : 'All realized orders have a verified successful payment fact.',
    };

    // Keep the arithmetic definition executable in the service as a guard
    // against a future SQL projection accidentally drifting from the contract.
    const recomputedContribution = calculatePlatformContribution({
      customer_paid_idr: asNumber(summary.customer_paid_idr),
      customer_refund_idr: asNumber(summary.customer_refund_idr),
      tax_idr: asNumber(summary.tax_idr),
      provider_fee_idr: asNumber(summary.provider_fee_idr),
      promo_subsidy_idr: asNumber(summary.promo_subsidy_idr),
      merchant_payable_idr: asNumber(summary.merchant_payable_idr),
      courier_payable_idr: asNumber(summary.courier_payable_idr),
      carrier_payable_idr: asNumber(summary.carrier_payable_idr),
      ads_other_charges_idr: asNumber(summary.ads_other_charges_idr),
    });
    const summaryWithCheck = {
      ...summary,
      platform_contribution_idr: asNumber(summary.platform_contribution_idr),
      reconciliation_check: {
        formula_result_idr: recomputedContribution,
        matches_formula: recomputedContribution === asNumber(summary.platform_contribution_idr),
        source_coverage_complete: coverage.reconciliation_status === 'complete',
      },
    };

    res.json({
      success: true,
      data: {
        definition: UNIT_ECONOMICS_DEFINITION,
        period: { start: start.toISOString(), end: end.toISOString(), cohort },
        summary: summaryWithCheck,
        cohorts,
        negative_margin_outliers: outliers,
        source_coverage: coverage,
        // Existing dashboard consumers can render the same endpoint without
        // being given a second, incompatible financial definition.
        metrics: [
          { label: 'Customer Paid (net refund)', value: asNumber(summary.net_customer_paid_idr), status: 'Info' },
          { label: 'Merchant Payable', value: asNumber(summary.merchant_payable_idr), status: 'Info' },
          { label: 'Courier Payable', value: asNumber(summary.courier_payable_idr), status: 'Info' },
          { label: 'Carrier Payable', value: asNumber(summary.carrier_payable_idr), status: 'Info' },
          { label: 'Platform Contribution', value: asNumber(summary.platform_contribution_idr), status: asNumber(summary.platform_contribution_idr) >= 0 ? 'Healthy' : 'Critical' },
        ],
      },
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 500;
    securityLog.error('Error generating authoritative unit economics:', { error: error?.message, statusCode });
    res.status(statusCode).json({ success: false, error: statusCode === 400 ? error.message : 'Internal server error generating unit economics' });
  }
};
