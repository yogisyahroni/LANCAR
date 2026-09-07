import { Request, Response } from 'express';
import { readDb } from '../db';
import { securityLog } from '../security/logRedaction';
import {
  DEFAULT_MARKETPLACE_FAIRNESS_POLICY,
  evaluateMarketplaceExperiment,
  MarketplaceFairnessSnapshot,
} from '../services/marketplaceFairness';

const parseWindowHours = (value: unknown): number => {
  const parsed = Number(value ?? 24);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 168) {
    throw new Error('window_hours must be an integer between 1 and 168');
  }
  return parsed;
};

const parseOptionalFilter = (value: unknown, name: string): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = String(value).trim();
  if (!parsed || parsed.length > 80 || !/^[a-zA-Z0-9_-]+$/.test(parsed)) {
    throw new Error(`${name} contains an invalid value`);
  }
  return parsed;
};

// Aggregate-only monitoring query. No user, merchant, or courier identifiers
// leave the database; the dimensions are market/zone/service only.
const metricQuery = `
  WITH bounds AS (
    SELECT NOW() - ($1::text || ' hours')::interval AS current_start,
           NOW() - (($1::int * 2)::text || ' hours')::interval AS previous_start
  ),
  scoped_orders AS (
    SELECT o.id, o.merchant_id, o.status, o.total_price_idr, o.assigned_at, o.created_at,
      COALESCE(NULLIF(z.market_code, ''), 'unknown') AS market_code,
      COALESCE(NULLIF(z.code, ''), 'unknown') AS zone_code,
      COALESCE(NULLIF(o.service_code, ''), NULLIF(o.service_sub_type, ''), 'unknown') AS service_code,
      CASE WHEN o.created_at >= b.current_start THEN 'current' ELSE 'previous' END AS period,
      EXISTS (SELECT 1 FROM order_events oe WHERE oe.order_id = o.id
        AND oe.event_type IN ('no_courier_found', 'order.no_courier_found')) AS had_no_supply
    FROM orders o CROSS JOIN bounds b
    LEFT JOIN LATERAL (
      SELECT z.market_code, z.code FROM zones z
      WHERE z.is_active = TRUE AND ST_Covers(z.polygon, o.pickup_location)
      ORDER BY z.id LIMIT 1
    ) z ON TRUE
    WHERE o.created_at >= b.previous_start
      AND (LOWER(COALESCE(o.service_sub_type, '')) = 'food_delivery'
        OR LOWER(COALESCE(o.service_category, '')) = 'food'
        OR LOWER(COALESCE(o.service_code, '')) = 'food_delivery')
  ),
  merchant_counts AS (
    SELECT market_code, zone_code, service_code, merchant_id, COUNT(*)::numeric AS order_count
    FROM scoped_orders WHERE merchant_id IS NOT NULL AND status NOT IN ('cancelled', 'failed')
    GROUP BY market_code, zone_code, service_code, merchant_id
  ),
  merchant_totals AS (
    SELECT market_code, zone_code, service_code, SUM(order_count)::numeric AS total_orders
    FROM merchant_counts GROUP BY market_code, zone_code, service_code
  ),
  merchant_stats AS (
    SELECT mc.market_code, mc.zone_code, mc.service_code,
      ROUND((MAX(mc.order_count) / NULLIF(MAX(mt.total_orders), 0) * 100)::numeric, 2)::float8 AS merchant_top_share_pct,
      ROUND(SUM(POWER(mc.order_count / NULLIF(mt.total_orders, 0) * 100, 2))::numeric, 2)::float8 AS merchant_hhi
    FROM merchant_counts mc JOIN merchant_totals mt USING (market_code, zone_code, service_code)
    GROUP BY mc.market_code, mc.zone_code, mc.service_code
  ),
  price_stats AS (
    SELECT market_code, zone_code, service_code, COUNT(*)::int AS price_sample_size,
      COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY total_price_idr), 0)::float8 AS customer_price_p50_idr,
      COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY total_price_idr), 0)::float8 AS customer_price_p95_idr
    FROM scoped_orders WHERE total_price_idr >= 0 GROUP BY market_code, zone_code, service_code
  ),
  courier_order_earnings AS (
    SELECT so.market_code, so.zone_code, so.service_code, cel.courier_id, cel.order_id,
      SUM(cel.amount_idr)::numeric AS earning_idr
    FROM scoped_orders so
    JOIN order_legs ol ON ol.order_id = so.id AND ol.courier_id IS NOT NULL
    JOIN courier_earnings_ledger cel ON cel.order_id = so.id AND cel.courier_id = ol.courier_id
      AND cel.direction = 'credit' AND cel.amount_idr > 0
    GROUP BY so.market_code, so.zone_code, so.service_code, cel.courier_id, cel.order_id
  ),
  courier_totals AS (
    SELECT market_code, zone_code, service_code, courier_id, SUM(earning_idr)::numeric AS earning_idr
    FROM courier_order_earnings GROUP BY market_code, zone_code, service_code, courier_id
  ),
  courier_stats AS (
    SELECT market_code, zone_code, service_code, COUNT(*)::int AS courier_sample_size,
      COALESCE(percentile_cont(0.10) WITHIN GROUP (ORDER BY earning_idr), 0)::float8 AS courier_earnings_p10_idr,
      COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY earning_idr), 0)::float8 AS courier_earnings_p50_idr,
      COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY earning_idr), 0)::float8 AS courier_earnings_p95_idr
    FROM courier_totals GROUP BY market_code, zone_code, service_code
  ),
  outcome_stats AS (
    SELECT market_code, zone_code, service_code, period, COUNT(*)::int AS order_sample_size,
      ROUND((COUNT(*) FILTER (WHERE status = 'cancelled')::numeric / NULLIF(COUNT(*), 0) * 100), 2)::float8 AS cancellation_rate_pct,
      ROUND((COUNT(*) FILTER (WHERE assigned_at IS NOT NULL OR status IN ('accepted', 'picking_up', 'delivering', 'delivered', 'completed'))::numeric / NULLIF(COUNT(*), 0) * 100), 2)::float8 AS acceptance_rate_pct,
      ROUND((COUNT(*) FILTER (WHERE had_no_supply OR status = 'no_courier_found')::numeric / NULLIF(COUNT(*), 0) * 100), 2)::float8 AS no_supply_rate_pct
    FROM scoped_orders GROUP BY market_code, zone_code, service_code, period
  ),
  dimensions AS (SELECT DISTINCT market_code, zone_code, service_code FROM scoped_orders)
  SELECT d.market_code, d.zone_code, d.service_code,
    COALESCE(cs.courier_sample_size, 0) AS courier_sample_size,
    COALESCE(cs.courier_earnings_p10_idr, 0) AS courier_earnings_p10_idr,
    COALESCE(cs.courier_earnings_p50_idr, 0) AS courier_earnings_p50_idr,
    COALESCE(cs.courier_earnings_p95_idr, 0) AS courier_earnings_p95_idr,
    COALESCE(ms.merchant_top_share_pct, 0) AS merchant_top_share_pct,
    COALESCE(ms.merchant_hhi, 0) AS merchant_hhi,
    COALESCE(ps.price_sample_size, 0) AS price_sample_size,
    COALESCE(ps.customer_price_p50_idr, 0) AS customer_price_p50_idr,
    COALESCE(ps.customer_price_p95_idr, 0) AS customer_price_p95_idr,
    COALESCE(cur.order_sample_size, 0) AS current_sample_size,
    COALESCE(cur.cancellation_rate_pct, 0) AS current_cancellation_rate_pct,
    COALESCE(cur.acceptance_rate_pct, 0) AS current_acceptance_rate_pct,
    COALESCE(cur.no_supply_rate_pct, 0) AS current_no_supply_rate_pct,
    COALESCE(prev.cancellation_rate_pct, 0) AS previous_cancellation_rate_pct,
    COALESCE(prev.acceptance_rate_pct, 0) AS previous_acceptance_rate_pct,
    COALESCE(prev.no_supply_rate_pct, 0) AS previous_no_supply_rate_pct
  FROM dimensions d
  LEFT JOIN courier_stats cs USING (market_code, zone_code, service_code)
  LEFT JOIN merchant_stats ms USING (market_code, zone_code, service_code)
  LEFT JOIN price_stats ps USING (market_code, zone_code, service_code)
  LEFT JOIN outcome_stats cur ON cur.market_code = d.market_code AND cur.zone_code = d.zone_code AND cur.service_code = d.service_code AND cur.period = 'current'
  LEFT JOIN outcome_stats prev ON prev.market_code = d.market_code AND prev.zone_code = d.zone_code AND prev.service_code = d.service_code AND prev.period = 'previous'
  WHERE ($2::text IS NULL OR d.market_code = $2) AND ($3::text IS NULL OR d.zone_code = $3) AND ($4::text IS NULL OR d.service_code = $4)
  ORDER BY d.market_code, d.zone_code, d.service_code
`;

const discoveryQuery = `
  WITH merchant_order_counts AS (
    SELECT merchant_id, COUNT(*)::int AS order_count FROM orders
    WHERE created_at >= NOW() - ($1::text || ' hours')::interval AND merchant_id IS NOT NULL
      AND status NOT IN ('cancelled', 'failed') GROUP BY merchant_id
  )
  SELECT COUNT(*)::int AS discovery_events,
    COUNT(*) FILTER (WHERE m.created_at >= NOW() - INTERVAL '90 days' OR COALESCE(moc.order_count, 0) <= 10)::int AS new_small_discovery_events
  FROM food_discovery_ad_events e JOIN merchants m ON m.id = e.merchant_id
  LEFT JOIN merchant_order_counts moc ON moc.merchant_id = e.merchant_id
  WHERE e.created_at >= NOW() - ($1::text || ' hours')::interval AND e.event_type IN ('impression', 'click')
`;

const finiteNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getMarketplaceFairnessMetrics = async (req: Request, res: Response): Promise<void> => {
  let windowHours: number;
  let marketCode: string | undefined;
  let zoneCode: string | undefined;
  let serviceCode: string | undefined;
  try {
    windowHours = parseWindowHours(req.query.window_hours);
    marketCode = parseOptionalFilter(req.query.market_code, 'market_code');
    zoneCode = parseOptionalFilter(req.query.zone_code, 'zone_code');
    serviceCode = parseOptionalFilter(req.query.service_code, 'service_code');
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }
  try {
    const [metricsResult, discoveryResult] = await Promise.all([
      readDb.query(metricQuery, [windowHours, marketCode ?? null, zoneCode ?? null, serviceCode ?? null]),
      readDb.query(discoveryQuery, [windowHours]),
    ]);
    const discoveryRow = discoveryResult.rows[0] ?? {};
    const discoveryEvents = finiteNumber(discoveryRow.discovery_events);
    const newSmallDiscoveryEvents = finiteNumber(discoveryRow.new_small_discovery_events);
    res.json({
      success: true,
      observed_at: new Date().toISOString(),
      window_hours: windowHours,
      dimensions: metricsResult.rows.map((row) => ({
        market_code: row.market_code, zone_code: row.zone_code, service_code: row.service_code,
        outlier_flags: [
          finiteNumber(row.courier_earnings_p10_idr) > 0 && finiteNumber(row.courier_earnings_p95_idr) / finiteNumber(row.courier_earnings_p10_idr) > 5
            ? 'courier_earnings_p95_to_p10_ratio' : null,
          finiteNumber(row.merchant_top_share_pct) > DEFAULT_MARKETPLACE_FAIRNESS_POLICY.maxMerchantTopSharePct
            ? 'merchant_top_share_pct' : null,
          finiteNumber(row.merchant_hhi) > DEFAULT_MARKETPLACE_FAIRNESS_POLICY.maxMerchantHHI ? 'merchant_hhi' : null,
          finiteNumber(row.current_no_supply_rate_pct) > DEFAULT_MARKETPLACE_FAIRNESS_POLICY.maxNoSupplyRatePct
            ? 'no_supply_rate_pct' : null,
          finiteNumber(row.current_cancellation_rate_pct) - finiteNumber(row.previous_cancellation_rate_pct) > DEFAULT_MARKETPLACE_FAIRNESS_POLICY.maxCancellationIncreasePp
            ? 'cancellation_rate_increase_pp' : null,
          finiteNumber(row.previous_acceptance_rate_pct) - finiteNumber(row.current_acceptance_rate_pct) > DEFAULT_MARKETPLACE_FAIRNESS_POLICY.maxAcceptanceDropPp
            ? 'acceptance_rate_drop_pp' : null,
        ].filter((flag): flag is string => Boolean(flag)),
        courier_earnings_distribution: {
          sample_size: finiteNumber(row.courier_sample_size), p10_idr: finiteNumber(row.courier_earnings_p10_idr),
          p50_idr: finiteNumber(row.courier_earnings_p50_idr), p95_idr: finiteNumber(row.courier_earnings_p95_idr),
        },
        merchant_exposure: { top_share_pct: finiteNumber(row.merchant_top_share_pct), hhi: finiteNumber(row.merchant_hhi) },
        no_supply: { current_rate_pct: finiteNumber(row.current_no_supply_rate_pct), previous_rate_pct: finiteNumber(row.previous_no_supply_rate_pct) },
        customer_price_distribution: {
          sample_size: finiteNumber(row.price_sample_size), p50_idr: finiteNumber(row.customer_price_p50_idr), p95_idr: finiteNumber(row.customer_price_p95_idr),
        },
        cancellation_acceptance: {
          current_cancellation_rate_pct: finiteNumber(row.current_cancellation_rate_pct), previous_cancellation_rate_pct: finiteNumber(row.previous_cancellation_rate_pct),
          current_acceptance_rate_pct: finiteNumber(row.current_acceptance_rate_pct), previous_acceptance_rate_pct: finiteNumber(row.previous_acceptance_rate_pct),
        },
      })),
      discovery: {
        source: 'food_discovery_ad_events', events: discoveryEvents, new_small_merchant_events: newSmallDiscoveryEvents,
        new_small_merchant_share_pct: discoveryEvents > 0 ? Number((newSmallDiscoveryEvents / discoveryEvents * 100).toFixed(2)) : 0,
      },
      policy: DEFAULT_MARKETPLACE_FAIRNESS_POLICY,
    });
  } catch (error: any) {
    securityLog.error('Marketplace fairness metrics error:', error);
    res.status(500).json({ success: false, error: 'Marketplace fairness metrics unavailable' });
  }
};

export const evaluateMarketplaceFairness = async (req: Request, res: Response): Promise<void> => {
  try {
    const { baseline, candidate, revenue_uplift_pct } = req.body as {
      baseline: MarketplaceFairnessSnapshot; candidate: MarketplaceFairnessSnapshot; revenue_uplift_pct: number;
    };
    const decision = evaluateMarketplaceExperiment(baseline, candidate, Number(revenue_uplift_pct));
    res.status(decision.approved ? 200 : 409).json({ success: decision.approved, data: decision });
  } catch (error: any) {
    securityLog.warn('Marketplace fairness evaluation rejected:', error?.message);
    res.status(400).json({ success: false, error: error.message });
  }
};
