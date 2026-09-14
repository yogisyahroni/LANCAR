import { readDb } from '../db';

export const COST_OBSERVABILITY_VERSION = 'cost-observability-2026-v1';

export type CostUsageRow = {
  unit_code: string;
  unit_label: string;
  unit_count: number;
  actual_cost_idr: number;
  costed_unit_count: number;
  unpriced_unit_count: number;
  source_table: string;
};

export type CostAnomaly = CostUsageRow & {
  previous_unit_count: number;
  previous_cost_idr: number;
  current_cost_per_unit_idr: number;
  previous_cost_per_unit_idr: number;
  traffic_growth_pct: number | null;
  cost_growth_pct: number | null;
  unit_cost_growth_pct: number | null;
  severity: 'warning' | 'critical';
  reason: string;
};

export type CostAnomalyPolicy = {
  min_units: number;
  min_cost_idr: number;
  max_growth_pct: number;
  max_unit_cost_growth_pct: number;
};

type Queryable = {
  query: <T = Record<string, unknown>>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

const numberValue = (value: unknown): number => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const percentageGrowth = (previous: number, current: number): number | null => {
  if (previous <= 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(2));
};

const costPerUnit = (cost: number, units: number): number =>
  units > 0 ? Number((cost / units).toFixed(2)) : 0;

export const normalizeCostUsageRow = (row: Record<string, unknown>): CostUsageRow => ({
  unit_code: String(row.unit_code || ''),
  unit_label: String(row.unit_label || row.unit_code || ''),
  unit_count: numberValue(row.unit_count),
  actual_cost_idr: numberValue(row.actual_cost_idr),
  costed_unit_count: numberValue(row.costed_unit_count),
  unpriced_unit_count: numberValue(row.unpriced_unit_count),
  source_table: String(row.source_table || ''),
});

/**
 * Cost observations are derived from persisted operational facts. A zero cost
 * is preserved as a real zero; missing cost is counted separately so a new
 * channel/provider cannot silently look free.
 */
export const COST_USAGE_QUERY = `
WITH usage_rows AS (
  SELECT
    'realized_order'::text AS unit_code,
    'Realized order'::text AS unit_label,
    1::bigint AS unit_count,
    0::bigint AS actual_cost_idr,
    0::bigint AS costed_unit_count,
    0::bigint AS unpriced_unit_count,
    'orders'::text AS source_table,
    COALESCE(o.delivered_at, o.updated_at, o.created_at) AS occurred_at
  FROM orders o
  WHERE LOWER(o.status::text) IN ('delivered', 'completed', 'pod_completed')
    AND COALESCE(o.delivered_at, o.updated_at, o.created_at) >= $1::timestamptz
    AND COALESCE(o.delivered_at, o.updated_at, o.created_at) < $2::timestamptz

  UNION ALL

  SELECT
    'payment_provider_transaction',
    'Payment provider transaction',
    1::bigint,
    GREATEST(COALESCE(p.mdr_amount_idr, 0), 0)::bigint,
    1::bigint,
    0::bigint,
    'payments',
    COALESCE(p.paid_at, p.updated_at, p.created_at)
  FROM payments p
  WHERE LOWER(p.status::text) IN ('paid', 'settled', 'success', 'completed')
    AND COALESCE(p.paid_at, p.updated_at, p.created_at) >= $1::timestamptz
    AND COALESCE(p.paid_at, p.updated_at, p.created_at) < $2::timestamptz

  UNION ALL

  SELECT
    'carrier_invoice_item',
    'Carrier provider invoice item',
    1::bigint,
    GREATEST(COALESCE(pii.claimed_amount_idr, 0), 0)::bigint,
    1::bigint,
    0::bigint,
    'provider_invoice_items',
    pii.created_at
  FROM provider_invoice_items pii
  JOIN provider_invoices pi ON pi.id = pii.invoice_id
  WHERE pii.created_at >= $1::timestamptz
    AND pii.created_at < $2::timestamptz

  UNION ALL

  SELECT
    'communication_delivery:' || cd.channel,
    'Communication delivery (' || cd.channel || ')',
    1::bigint,
    GREATEST(COALESCE(cd.cost_minor, 0), 0)::bigint,
    CASE WHEN cd.cost_minor IS NULL THEN 0 ELSE 1 END::bigint,
    CASE WHEN cd.cost_minor IS NULL THEN 1 ELSE 0 END::bigint,
    'communication_deliveries',
    cd.created_at
  FROM communication_deliveries cd
  WHERE cd.created_at >= $1::timestamptz
    AND cd.created_at < $2::timestamptz

  UNION ALL

  SELECT
    'ads_billed_event',
    'Ads billed event (IDR)',
    1::bigint,
    CASE WHEN abe.currency_code = 'IDR' THEN GREATEST(abe.cost_minor, 0) ELSE 0 END::bigint,
    CASE WHEN abe.currency_code = 'IDR' THEN 1 ELSE 0 END::bigint,
    CASE WHEN abe.currency_code = 'IDR' THEN 0 ELSE 1 END::bigint,
    'ads_billing_events',
    abe.occurred_at
  FROM ads_billing_events abe
  WHERE abe.status = 'charged'
    AND abe.occurred_at >= $1::timestamptz
    AND abe.occurred_at < $2::timestamptz

  UNION ALL

  SELECT
    'promo_redemption',
    'Redeemed promotion subsidy',
    1::bigint,
    GREATEST(COALESCE(pr.discount_idr, 0), 0)::bigint,
    1::bigint,
    0::bigint,
    'promo_redemptions',
    COALESCE(pr.redeemed_at, pr.created_at)
  FROM promo_redemptions pr
  WHERE LOWER(pr.status::text) = 'redeemed'
    AND COALESCE(pr.redeemed_at, pr.created_at) >= $1::timestamptz
    AND COALESCE(pr.redeemed_at, pr.created_at) < $2::timestamptz

  UNION ALL

  SELECT
    'courier_payable_entry',
    'Courier payable ledger entry',
    1::bigint,
    CASE WHEN LOWER(cel.direction::text) = 'debit' THEN -cel.amount_idr ELSE cel.amount_idr END::bigint,
    1::bigint,
    0::bigint,
    'courier_earnings_ledger',
    cel.created_at
  FROM courier_earnings_ledger cel
  WHERE LOWER(cel.settlement_status::text) <> 'cancelled'
    AND cel.created_at >= $1::timestamptz
    AND cel.created_at < $2::timestamptz
)
SELECT unit_code, MIN(unit_label) AS unit_label,
       COUNT(*)::bigint AS unit_count,
       COALESCE(SUM(actual_cost_idr), 0)::bigint AS actual_cost_idr,
       COALESCE(SUM(costed_unit_count), 0)::bigint AS costed_unit_count,
       COALESCE(SUM(unpriced_unit_count), 0)::bigint AS unpriced_unit_count,
       MIN(source_table) AS source_table
  FROM usage_rows
 GROUP BY unit_code
 ORDER BY unit_code`;

export const getCostUsageSnapshot = async (
  start: Date,
  end: Date,
  queryable: Queryable = readDb,
): Promise<CostUsageRow[]> => {
  const result = await queryable.query<Record<string, unknown>>(COST_USAGE_QUERY, [start, end]);
  return result.rows.map(normalizeCostUsageRow);
};

export const costAnomalyPolicyFromEnv = (env: NodeJS.ProcessEnv = process.env): CostAnomalyPolicy => {
  const positive = (name: string, fallback: number): number => {
    const value = Number(env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    min_units: positive('COST_ANOMALY_MIN_UNITS', 5),
    min_cost_idr: positive('COST_ANOMALY_MIN_COST_IDR', 1000),
    max_growth_pct: positive('COST_ANOMALY_MAX_GROWTH_PCT', 50),
    max_unit_cost_growth_pct: positive('COST_ANOMALY_MAX_UNIT_COST_GROWTH_PCT', 50),
  };
};

export const evaluateCostAnomalies = (
  current: CostUsageRow[],
  previous: CostUsageRow[],
  policy: CostAnomalyPolicy = costAnomalyPolicyFromEnv(),
): CostAnomaly[] => {
  const previousByUnit = new Map(previous.map((row) => [row.unit_code, row]));
  const anomalies: CostAnomaly[] = [];

  for (const row of current) {
    const prior = previousByUnit.get(row.unit_code);
    if (!prior) continue;

    const trafficGrowth = percentageGrowth(prior.unit_count, row.unit_count);
    const costGrowth = percentageGrowth(prior.actual_cost_idr, row.actual_cost_idr);
    const currentPerUnit = costPerUnit(row.actual_cost_idr, row.unit_count);
    const previousPerUnit = costPerUnit(prior.actual_cost_idr, prior.unit_count);
    const unitCostGrowth = percentageGrowth(previousPerUnit, currentPerUnit);
    const missingCost = row.unpriced_unit_count > 0;
    const trafficSpike = row.unit_count >= policy.min_units
      && trafficGrowth !== null
      && trafficGrowth > policy.max_growth_pct;
    const costSpike = row.actual_cost_idr >= policy.min_cost_idr
      && ((costGrowth !== null && costGrowth > policy.max_growth_pct)
        || (unitCostGrowth !== null && unitCostGrowth > policy.max_unit_cost_growth_pct));

    if (!missingCost && !trafficSpike && !costSpike) continue;

    const reasons = [
      missingCost ? `${row.unpriced_unit_count} usage unit(s) have no configured cost` : null,
      trafficSpike ? `traffic grew ${trafficGrowth}%` : null,
      costSpike ? `cost grew ${costGrowth ?? unitCostGrowth}%` : null,
    ].filter(Boolean);
    anomalies.push({
      ...row,
      previous_unit_count: prior.unit_count,
      previous_cost_idr: prior.actual_cost_idr,
      current_cost_per_unit_idr: currentPerUnit,
      previous_cost_per_unit_idr: previousPerUnit,
      traffic_growth_pct: trafficGrowth,
      cost_growth_pct: costGrowth,
      unit_cost_growth_pct: unitCostGrowth,
      severity: costSpike || (trafficSpike && row.actual_cost_idr >= policy.min_cost_idr) ? 'critical' : 'warning',
      reason: reasons.join('; '),
    });
  }
  return anomalies;
};
