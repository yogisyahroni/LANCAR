export const UNIT_ECONOMICS_DEFINITION = {
  version: 'unit-economics-2026-v1',
  basis: 'realized_orders_by_financial_at',
  realized_order_statuses: ['delivered', 'completed', 'pod_completed'],
  customer_paid: 'verified successful payment rows from payments.amount_idr',
  customer_refund: 'processed/processing/refunded refund rows linked to the order',
  tax: 'order tax snapshot ppn_idr, with payment ppn_amount_idr only for legacy rows without order tax',
  provider_fee: 'verified payment processor MDR from payments.mdr_amount_idr',
  promo_subsidy: 'order promo_subsidy_idr or redeemed promo ledger for legacy rows',
  merchant_payable: 'merchant settlement net payout, otherwise immutable pricing snapshot merchant_payable_idr',
  courier_payable: 'signed courier_earnings_ledger facts, otherwise immutable pricing snapshot courier_earning_idr',
  carrier_payable: 'provider invoice claimed amount, otherwise immutable order provider/logistics net cost snapshot',
  ads_other_charges: 'order-attributed double-entry expense debits for approved Ads/other account names, otherwise settlement snapshot Ads amount',
  platform_contribution: 'net customer paid - tax - provider fee - promo subsidy - merchant payable - courier payable - carrier payable - Ads/other charges',
  cohort_dimensions: ['market', 'service', 'order_cohort'],
} as const;

export const UNIT_ECONOMICS_ACCOUNT_NAMES = [
  'ads_expense',
  'marketing_expense',
  'support_expense',
  'infrastructure_expense',
  'other_operating_expense',
  'chargeback_expense',
] as const;

export type UnitEconomicsAmountRow = {
  customer_paid_idr: number;
  customer_refund_idr: number;
  tax_idr: number;
  provider_fee_idr: number;
  promo_subsidy_idr: number;
  merchant_payable_idr: number;
  courier_payable_idr: number;
  carrier_payable_idr: number;
  ads_other_charges_idr: number;
};

export const calculatePlatformContribution = (row: UnitEconomicsAmountRow): number => {
  const netCustomerPaid = row.customer_paid_idr - row.customer_refund_idr;
  return netCustomerPaid
    - row.tax_idr
    - row.provider_fee_idr
    - row.promo_subsidy_idr
    - row.merchant_payable_idr
    - row.courier_payable_idr
    - row.carrier_payable_idr
    - row.ads_other_charges_idr;
};

const numberValue = (value: unknown): number => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizeAmountRow = (row: Record<string, unknown>): Record<string, unknown> => ({
  ...row,
  customer_paid_idr: numberValue(row.customer_paid_idr),
  customer_refund_idr: numberValue(row.customer_refund_idr),
  net_customer_paid_idr: numberValue(row.net_customer_paid_idr),
  tax_idr: numberValue(row.tax_idr),
  provider_fee_idr: numberValue(row.provider_fee_idr),
  promo_subsidy_idr: numberValue(row.promo_subsidy_idr),
  merchant_payable_idr: numberValue(row.merchant_payable_idr),
  courier_payable_idr: numberValue(row.courier_payable_idr),
  carrier_payable_idr: numberValue(row.carrier_payable_idr),
  ads_other_charges_idr: numberValue(row.ads_other_charges_idr),
  platform_contribution_idr: numberValue(row.platform_contribution_idr),
  order_count: numberValue(row.order_count),
});

const safeCohort = (cohort: string): 'day' | 'week' | 'month' =>
  cohort === 'month' || cohort === 'week' ? cohort : 'day';

/**
 * One SQL source of truth is reused for summary, cohorts, and outlier traces.
 * All joins are pre-aggregated by order_id so retries/ledger rows cannot
 * multiply revenue or payable amounts through a many-to-many join.
 */
export const unitEconomicsBaseCte = (cohort: string): string => {
  const cohortGrain = safeCohort(cohort);
  const ledgerAccounts = UNIT_ECONOMICS_ACCOUNT_NAMES.map((name) => `'${name}'`).join(', ');

  return `
WITH paid_payment_facts AS (
  SELECT
    p.order_id,
    COALESCE(SUM(p.amount_idr), 0)::bigint AS customer_paid_idr,
    COALESCE(SUM(p.mdr_amount_idr), 0)::bigint AS provider_fee_idr,
    COALESCE(SUM(p.ppn_amount_idr), 0)::bigint AS payment_tax_idr,
    COUNT(*)::int AS paid_payment_count
  FROM payments p
  WHERE LOWER(p.status::text) IN ('paid', 'settled', 'success', 'completed')
  GROUP BY p.order_id
),
refund_facts AS (
  SELECT
    r.order_id,
    COALESCE(SUM(r.amount_idr), 0)::bigint AS customer_refund_idr
  FROM refunds r
  WHERE LOWER(r.status::text) IN ('processed', 'processing', 'refunded', 'completed')
  GROUP BY r.order_id
),
courier_facts AS (
  SELECT
    cel.order_id,
    COALESCE(SUM(CASE WHEN LOWER(cel.direction::text) = 'debit' THEN -cel.amount_idr ELSE cel.amount_idr END), 0)::bigint AS courier_payable_idr,
    COUNT(*)::int AS courier_ledger_entry_count
  FROM courier_earnings_ledger cel
  WHERE cel.order_id IS NOT NULL
    AND LOWER(cel.settlement_status::text) NOT IN ('cancelled')
  GROUP BY cel.order_id
),
merchant_facts AS (
  SELECT
    ms.order_id,
    COALESCE(SUM(ms.net_payout_idr), 0)::bigint AS merchant_payable_idr,
    COUNT(*)::int AS merchant_settlement_count
  FROM merchant_settlements ms
  GROUP BY ms.order_id
),
provider_facts AS (
  SELECT
    pii.order_id,
    COALESCE(SUM(pii.claimed_amount_idr), 0)::bigint AS carrier_payable_idr,
    COUNT(*)::int AS provider_invoice_item_count
  FROM provider_invoice_items pii
  JOIN provider_invoices pi ON pi.id = pii.invoice_id
  WHERE pii.order_id IS NOT NULL
  GROUP BY pii.order_id
),
promo_facts AS (
  SELECT
    pr.order_id,
    COALESCE(SUM(pr.discount_idr) FILTER (WHERE LOWER(pr.status::text) = 'redeemed'), 0)::bigint AS redeemed_promo_subsidy_idr
  FROM promo_redemptions pr
  WHERE pr.order_id IS NOT NULL
  GROUP BY pr.order_id
),
ledger_order_entries AS (
  SELECT o.id AS order_id, j.id AS journal_id, e.id AS entry_id, e.account_name, e.debit_idr, e.credit_idr
  FROM ledger_journals j
  JOIN ledger_entries e ON e.journal_id = j.id
  JOIN orders o ON o.id::text = j.reference_id
  UNION
  SELECT p.order_id, j.id, e.id, e.account_name, e.debit_idr, e.credit_idr
  FROM ledger_journals j
  JOIN ledger_entries e ON e.journal_id = j.id
  JOIN payments p ON p.id::text = j.reference_id
  WHERE p.order_id IS NOT NULL
),
ledger_facts AS (
  SELECT
    loe.order_id,
    COALESCE(SUM(loe.debit_idr) FILTER (WHERE LOWER(loe.account_name) IN (${ledgerAccounts})), 0)::bigint AS ledger_ads_other_charges_idr,
    COUNT(*) FILTER (WHERE LOWER(loe.account_name) IN (${ledgerAccounts}))::int AS ads_ledger_entry_count
  FROM ledger_order_entries loe
  GROUP BY loe.order_id
),
eligible_orders AS (
  SELECT
    o.*,
    COALESCE(o.delivered_at, o.updated_at, o.created_at) AS financial_at,
    COALESCE(
      NULLIF(o.pricing_snapshot->>'market', ''),
      NULLIF(o.service_snapshot->>'market', ''),
      'default'
    ) AS market_bucket,
    CASE
      WHEN o.service_sub_type = 'food_delivery' THEN 'food_delivery'
      WHEN o.service_sub_type IN ('tambal_ban_motor', 'tambal_ban_mobil') THEN 'tambal_ban'
      WHEN o.service_sub_type IN ('towing_motor', 'towing_mobil') THEN 'towing'
      WHEN COALESCE(o.service_category, '') <> '' THEN o.service_category
      WHEN COALESCE(o.service_code, '') <> '' THEN o.service_code
      ELSE COALESCE(o.model, 'unknown')
    END AS service_bucket
  FROM orders o
  WHERE LOWER(o.status::text) IN ('delivered', 'completed', 'pod_completed')
    AND COALESCE(o.delivered_at, o.updated_at, o.created_at) >= $1::timestamptz
    AND COALESCE(o.delivered_at, o.updated_at, o.created_at) < $2::timestamptz
),
order_facts AS (
  SELECT
    eo.id AS order_id,
    eo.order_number,
    eo.market_bucket,
    eo.service_bucket,
    TO_CHAR(DATE_TRUNC('${cohortGrain}', eo.financial_at), 'YYYY-MM-DD') AS order_cohort,
    eo.financial_at,
    COALESCE(pp.customer_paid_idr, 0)::bigint AS customer_paid_idr,
    COALESCE(rf.customer_refund_idr, 0)::bigint AS customer_refund_idr,
    GREATEST(COALESCE(pp.customer_paid_idr, 0) - COALESCE(rf.customer_refund_idr, 0), 0)::bigint AS net_customer_paid_idr,
    GREATEST(COALESCE(NULLIF(eo.ppn_idr, 0), NULLIF(pp.payment_tax_idr, 0), 0), 0)::bigint AS tax_idr,
    COALESCE(pp.provider_fee_idr, 0)::bigint AS provider_fee_idr,
    CASE
      WHEN COALESCE(eo.promo_subsidy_idr, 0) > 0 THEN eo.promo_subsidy_idr
      ELSE COALESCE(promo.redeemed_promo_subsidy_idr, 0)
    END::bigint AS promo_subsidy_idr,
    CASE
      WHEN COALESCE(mf.merchant_settlement_count, 0) > 0 THEN mf.merchant_payable_idr
      ELSE GREATEST(COALESCE(NULLIF(eo.pricing_snapshot->'pricing_breakdown'->>'merchant_payable_idr', '')::bigint, 0), 0)
    END::bigint AS merchant_payable_idr,
    CASE
      WHEN COALESCE(cf.courier_ledger_entry_count, 0) > 0 THEN GREATEST(cf.courier_payable_idr, 0)
      ELSE GREATEST(COALESCE(NULLIF(eo.pricing_snapshot->'pricing_breakdown'->>'courier_earning_idr', '')::bigint, eo.courier_payout_estimate_idr, 0), 0)
    END::bigint AS courier_payable_idr,
    CASE
      WHEN COALESCE(pf.provider_invoice_item_count, 0) > 0 THEN pf.carrier_payable_idr
      ELSE GREATEST(COALESCE(NULLIF(eo.provider_net_cost_idr, 0), NULLIF(eo.logistics_net_cost_idr, 0), 0), 0)
    END::bigint AS carrier_payable_idr,
    CASE
      WHEN COALESCE(lf.ads_ledger_entry_count, 0) > 0 THEN lf.ledger_ads_other_charges_idr
      ELSE GREATEST(COALESCE(NULLIF(eo.settlement_snapshot->'merchant_commercial_terms'->>'ads_spend_idr', '')::bigint, 0), 0)
    END::bigint AS ads_other_charges_idr,
    COALESCE(pp.paid_payment_count, 0)::int AS paid_payment_count,
    COALESCE(cf.courier_ledger_entry_count, 0)::int AS courier_ledger_entry_count,
    COALESCE(mf.merchant_settlement_count, 0)::int AS merchant_settlement_count,
    COALESCE(pf.provider_invoice_item_count, 0)::int AS provider_invoice_item_count,
    COALESCE(lf.ads_ledger_entry_count, 0)::int AS ads_ledger_entry_count,
    (eo.pricing_snapshot IS NOT NULL AND eo.pricing_snapshot <> '{}'::jsonb) AS has_pricing_snapshot,
    CASE WHEN COALESCE(mf.merchant_settlement_count, 0) > 0 THEN 'merchant_settlement_ledger' ELSE 'pricing_snapshot' END AS merchant_payable_source,
    CASE WHEN COALESCE(cf.courier_ledger_entry_count, 0) > 0 THEN 'courier_earnings_ledger' ELSE 'pricing_snapshot' END AS courier_payable_source,
    CASE WHEN COALESCE(pf.provider_invoice_item_count, 0) > 0 THEN 'provider_invoice_item' ELSE 'order_cost_snapshot' END AS carrier_payable_source,
    CASE WHEN COALESCE(lf.ads_ledger_entry_count, 0) > 0 THEN 'ledger_expense' ELSE 'settlement_snapshot' END AS ads_other_charges_source,
    COALESCE(eo.pricing_snapshot->>'pricing_rule_version', eo.pricing_snapshot->'pricing_breakdown'->>'policy_version', '') AS pricing_rule_version,
    COALESCE(eo.pricing_snapshot->'pricing_breakdown'->>'policy_version', '') AS pricing_policy_version,
    COALESCE(eo.settlement_snapshot->'merchant_commercial_terms'->>'contract_version', '') AS merchant_contract_version,
    COALESCE(eo.pricing_snapshot->'pricing_breakdown'->'components', '[]'::jsonb) AS pricing_components
  FROM eligible_orders eo
  LEFT JOIN paid_payment_facts pp ON pp.order_id = eo.id
  LEFT JOIN refund_facts rf ON rf.order_id = eo.id
  LEFT JOIN courier_facts cf ON cf.order_id = eo.id
  LEFT JOIN merchant_facts mf ON mf.order_id = eo.id
  LEFT JOIN provider_facts pf ON pf.order_id = eo.id
  LEFT JOIN promo_facts promo ON promo.order_id = eo.id
  LEFT JOIN ledger_facts lf ON lf.order_id = eo.id
),
calculated_order_facts AS (
  SELECT
    of.*,
    (
      of.net_customer_paid_idr
      - of.tax_idr
      - of.provider_fee_idr
      - of.promo_subsidy_idr
      - of.merchant_payable_idr
      - of.courier_payable_idr
      - of.carrier_payable_idr
      - of.ads_other_charges_idr
    )::bigint AS platform_contribution_idr
  FROM order_facts of
)
`;
};
