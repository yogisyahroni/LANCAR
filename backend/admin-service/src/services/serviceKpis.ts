import { readDb } from '../db';
import { securityLog } from '../security/logRedaction';

export const SERVICE_KPI_CATEGORIES = [
  'package_on_demand',
  'food',
  'tambal_ban',
  'aggregator',
  'towing',
] as const;

export type ServiceKpiCategory = (typeof SERVICE_KPI_CATEGORIES)[number];

type QueryRow = Record<string, unknown>;

export type ServiceKpi = {
  service_category: ServiceKpiCategory;
  sample_size: number;
  coverage: Record<string, number>;
  metrics: Record<string, number | null>;
  provider_mix?: Array<{
    provider: string;
    order_count: number;
    share_pct: number | null;
  }>;
};

export type ServiceKpiWindow = {
  range: '24H' | '7D' | '30D' | '1Y';
  from: Date;
  to: Date;
};

const RANGE_HOURS: Record<ServiceKpiWindow['range'], number> = {
  '24H': 24,
  '7D': 24 * 7,
  '30D': 24 * 30,
  '1Y': 24 * 365,
};

const PACKAGE_QUERY = `
WITH base AS (
  SELECT o.*
  FROM orders o
  WHERE o.service_category = 'package_on_demand'
    AND o.created_at >= $1
    AND o.created_at < $2
)
SELECT
  COUNT(*)::int AS sample_size,
  COUNT(*) FILTER (WHERE o.assigned_at IS NOT NULL OR EXISTS (
    SELECT 1 FROM courier_offer_dispatches cod
    WHERE cod.order_id = o.id AND cod.status = 'accepted'
  ))::int AS matched_orders,
  COUNT(*) FILTER (WHERE pickup_leg.sla_deadline IS NOT NULL)::int AS pickup_sla_eligible,
  COUNT(*) FILTER (WHERE pickup_leg.sla_deadline IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sla_logs sl WHERE sl.order_leg_id = pickup_leg.id
  ))::int AS pickup_sla_met,
  COUNT(*) FILTER (WHERE delivery_leg.sla_deadline IS NOT NULL)::int AS delivery_sla_eligible,
  COUNT(*) FILTER (WHERE delivery_leg.sla_deadline IS NOT NULL
    AND delivery_leg.completed_at IS NOT NULL
    AND delivery_leg.completed_at <= delivery_leg.sla_deadline)::int AS delivery_sla_met,
  COUNT(*) FILTER (WHERE o.status = 'failed_delivery')::int AS failed_delivery_orders,
  COUNT(*) FILTER (WHERE o.status = 'return_to_sender' OR (
    o.status = 'failed_delivery' AND EXISTS (
      SELECT 1 FROM order_events oe
      WHERE oe.order_id = o.id
        AND (oe.to_status IN ('failed_delivery', 'return_to_sender')
          OR oe.event_type IN ('delivery_failed_reported', 'order.recovery_decision'))
    )
  ))::int AS recovery_orders,
  COUNT(*) FILTER (WHERE o.status = 'delivered')::int AS pod_eligible,
  COUNT(*) FILTER (WHERE o.status = 'delivered' AND NOT EXISTS (
    SELECT 1 FROM courier_proof_attempts cpa
    WHERE cpa.order_id = o.id AND cpa.proof_step = 'delivery' AND cpa.proof_status = 'accepted'
  ))::int AS pod_issue_orders
FROM base o
LEFT JOIN LATERAL (
  SELECT ol.id, ol.sla_deadline, ol.completed_at
  FROM order_legs ol
  WHERE ol.order_id = o.id
  ORDER BY ol.leg_number ASC
  LIMIT 1
) pickup_leg ON TRUE
LEFT JOIN LATERAL (
  SELECT ol.sla_deadline, ol.completed_at
  FROM order_legs ol
  WHERE ol.order_id = o.id
  ORDER BY ol.leg_number DESC
  LIMIT 1
) delivery_leg ON TRUE;
`;

const FOOD_QUERY = `
SELECT
  COUNT(*)::int AS sample_size,
  COUNT(*)::int AS response_eligible,
  COUNT(*) FILTER (WHERE o.merchant_accepted_at IS NOT NULL)::int AS responded_orders,
  AVG(EXTRACT(EPOCH FROM (o.merchant_accepted_at - o.created_at)) / 60.0)
    FILTER (WHERE o.merchant_accepted_at IS NOT NULL) AS response_minutes,
  COUNT(*) FILTER (WHERE o.merchant_accepted_at IS NOT NULL
    AND o.food_ready_at IS NOT NULL AND o.prep_time_minutes IS NOT NULL)::int AS prep_eligible,
  COUNT(*) FILTER (WHERE o.merchant_accepted_at IS NOT NULL
    AND o.food_ready_at IS NOT NULL AND o.prep_time_minutes IS NOT NULL
    AND o.food_ready_at <= o.merchant_accepted_at + (o.prep_time_minutes * INTERVAL '1 minute'))::int AS prep_on_time,
  COUNT(*) FILTER (WHERE o.food_ready_at IS NOT NULL AND o.picked_up_at IS NOT NULL)::int AS wait_eligible,
  AVG(EXTRACT(EPOCH FROM (o.picked_up_at - o.food_ready_at)) / 60.0)
    FILTER (WHERE o.food_ready_at IS NOT NULL AND o.picked_up_at IS NOT NULL) AS wait_minutes,
  COUNT(*) FILTER (WHERE o.food_ready_at IS NOT NULL)::int AS handoff_eligible,
  COUNT(*) FILTER (WHERE o.food_ready_at IS NOT NULL AND o.picked_up_at IS NOT NULL)::int AS handoff_success,
  COUNT(*)::int AS refund_eligible,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM refunds r
    WHERE r.order_id = o.id AND r.status <> 'failed'
  ))::int AS refunded_orders
FROM orders o
WHERE o.service_category = 'food'
  AND o.created_at >= $1
  AND o.created_at < $2;
`;

const TAMBAL_QUERY = `
SELECT
  COUNT(*)::int AS sample_size,
  COUNT(*)::int AS technician_match_eligible,
  COUNT(*) FILTER (WHERE leg.courier_id IS NOT NULL)::int AS technician_matched,
  AVG(EXTRACT(EPOCH FROM (leg.started_at - leg.assigned_at)) / 60.0)
    FILTER (WHERE leg.assigned_at IS NOT NULL AND leg.started_at IS NOT NULL) AS eta_minutes,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM tambal_ban_reports tbr WHERE tbr.order_id = o.id AND tbr.completed_at IS NOT NULL
  ))::int AS onsite_completed,
  COUNT(*) FILTER (WHERE leg.courier_id IS NOT NULL)::int AS onsite_eligible,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM service_adjustments sa WHERE sa.order_id = o.id
  ))::int AS adjusted_orders,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM roadside_service_claims rsc WHERE rsc.order_id = o.id
  ))::int AS claimed_orders
FROM orders o
LEFT JOIN LATERAL (
  SELECT ol.courier_id, ol.assigned_at, ol.started_at
  FROM order_legs ol
  WHERE ol.order_id = o.id
  ORDER BY ol.leg_number ASC
  LIMIT 1
) leg ON TRUE
WHERE o.service_category = 'tambal_ban'
  AND o.created_at >= $1
  AND o.created_at < $2;
`;

const AGGREGATOR_QUERY = `
WITH base AS (
  SELECT o.*
  FROM orders o
  WHERE o.service_category = 'aggregator'
    AND o.created_at >= $1
    AND o.created_at < $2
), provider_counts AS (
  SELECT COALESCE(NULLIF(b.logistics_provider, ''), 'unknown') AS provider,
         COUNT(*)::int AS order_count,
         ROUND(COUNT(*)::numeric * 100 / NULLIF(COUNT(*) OVER (), 0), 2) AS share_pct
  FROM base b
  GROUP BY 1
)
SELECT
  COUNT(*)::int AS sample_size,
  COUNT(*) FILTER (WHERE o.logistics_provider IS NOT NULL AND o.logistics_provider <> '')::int AS provider_rate_eligible,
  COUNT(*) FILTER (WHERE o.logistics_provider IS NOT NULL AND o.logistics_provider <> ''
    AND o.logistics_tariff_idr IS NOT NULL)::int AS provider_rate_success,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'provider', pc.provider, 'order_count', pc.order_count, 'share_pct', pc.share_pct
  ) ORDER BY pc.order_count DESC, pc.provider ASC) FROM provider_counts pc), '[]'::jsonb) AS provider_mix,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM aggregator_awb_attempts aaa WHERE aaa.order_id = o.id
  ))::int AS awb_attempt_eligible,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM aggregator_awb_attempts aaa WHERE aaa.order_id = o.id AND aaa.status = 'failed'
  ))::int AS awb_failed,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM carrier_event_inbox cei
    WHERE cei.awb_number = o.awb_number AND cei.occurred_at IS NOT NULL
  ))::int AS webhook_freshness_eligible,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM carrier_event_inbox cei
    WHERE cei.awb_number = o.awb_number AND cei.occurred_at IS NOT NULL
      AND cei.received_at <= cei.occurred_at + INTERVAL '15 minutes'
  ))::int AS webhook_fresh,
  COUNT(*) FILTER (WHERE delivery_leg.sla_deadline IS NOT NULL)::int AS carrier_sla_eligible,
  COUNT(*) FILTER (WHERE delivery_leg.sla_deadline IS NOT NULL
    AND delivery_leg.completed_at IS NOT NULL
    AND delivery_leg.completed_at <= delivery_leg.sla_deadline)::int AS carrier_sla_met,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM logistics_exception_claims lec
    WHERE lec.order_id = o.id AND lec.exception_type IN ('RETURN', 'LOST_CLAIM', 'DAMAGED_CLAIM')
  ))::int AS exception_orders,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM logistics_exception_claims lec
    WHERE lec.order_id = o.id AND lec.exception_type IN ('RETURN', 'LOST_CLAIM', 'DAMAGED_CLAIM')
      AND lec.status IN ('APPROVED', 'PAID', 'COMPENSATED')
  ))::int AS resolved_exception_orders,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM provider_invoice_items pii
    JOIN provider_invoices pi ON pi.id = pii.invoice_id
    WHERE pii.order_id = o.id
  ) OR EXISTS (
    SELECT 1 FROM logistics_exception_claims lec WHERE lec.order_id = o.id
  ))::int AS reconciliation_eligible,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM provider_invoice_items pii
    JOIN provider_invoices pi ON pi.id = pii.invoice_id
    WHERE pii.order_id = o.id
      AND (pi.status IN ('RECONCILED', 'APPROVED', 'PAID') OR pii.resolution_status = 'ACCEPTED')
  ) OR EXISTS (
    SELECT 1 FROM logistics_exception_claims lec
    WHERE lec.order_id = o.id AND lec.status IN ('APPROVED', 'PAID', 'COMPENSATED')
  ))::int AS reconciliation_resolved
FROM base o
LEFT JOIN LATERAL (
  SELECT ol.sla_deadline, ol.completed_at
  FROM order_legs ol
  WHERE ol.order_id = o.id
  ORDER BY ol.leg_number DESC
  LIMIT 1
) delivery_leg ON TRUE;
`;

const TOWING_QUERY = `
SELECT
  COUNT(*)::int AS sample_size,
  COUNT(*)::int AS operator_match_eligible,
  COUNT(*) FILTER (WHERE leg.courier_id IS NOT NULL)::int AS operator_matched,
  AVG(EXTRACT(EPOCH FROM (leg.started_at - leg.assigned_at)) / 60.0)
    FILTER (WHERE leg.assigned_at IS NOT NULL AND leg.started_at IS NOT NULL) AS arrival_minutes,
  COUNT(*) FILTER (WHERE tr.loading_started_at IS NOT NULL)::int AS loading_completed,
  COUNT(*) FILTER (WHERE leg.courier_id IS NOT NULL)::int AS loading_eligible,
  COUNT(*) FILTER (WHERE tr.transit_ended_at IS NOT NULL)::int AS transit_completed,
  COUNT(*) FILTER (WHERE tr.transit_started_at IS NOT NULL)::int AS transit_eligible,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM service_adjustments sa WHERE sa.order_id = o.id
  ))::int AS adjusted_orders,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM towing_damage_claims tdc WHERE tdc.order_id = o.id
  ))::int AS damage_claim_orders
FROM orders o
LEFT JOIN LATERAL (
  SELECT ol.courier_id, ol.assigned_at, ol.started_at
  FROM order_legs ol
  WHERE ol.order_id = o.id
  ORDER BY ol.leg_number ASC
  LIMIT 1
) leg ON TRUE
LEFT JOIN LATERAL (
  SELECT tr.loading_started_at, tr.transit_started_at, tr.transit_ended_at
  FROM towing_reports tr
  WHERE tr.order_id = o.id
  ORDER BY tr.created_at DESC
  LIMIT 1
) tr ON TRUE
WHERE o.service_category = 'towing'
  AND o.created_at >= $1
  AND o.created_at < $2;
`;

const toNumber = (value: unknown): number => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};

const toNullableMetric = (numerator: unknown, denominator: unknown): number | null => {
  const n = toNumber(numerator);
  const d = toNumber(denominator);
  if (d <= 0) return null;
  return Number(((n / d) * 100).toFixed(2));
};

const toNullableAverage = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? Number(result.toFixed(2)) : null;
};

const parseProviderMix = (value: unknown): ServiceKpi['provider_mix'] => {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => {
    const row = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
    return {
      provider: String(row.provider || 'unknown'),
      order_count: toNumber(row.order_count),
      share_pct: row.share_pct === null || row.share_pct === undefined ? null : toNullableAverage(row.share_pct),
    };
  });
};

export const parseServiceKpiWindow = (value: unknown, now = new Date()): ServiceKpiWindow => {
  const requested = String(value || '7D').toUpperCase() as ServiceKpiWindow['range'];
  const range = requested in RANGE_HOURS ? requested : '7D';
  return {
    range,
    from: new Date(now.getTime() - RANGE_HOURS[range] * 60 * 60 * 1000),
    to: now,
  };
};

const serviceKpiFromRow = (service_category: ServiceKpiCategory, row: QueryRow): ServiceKpi => {
  const sampleSize = toNumber(row.sample_size);

  if (service_category === 'package_on_demand') {
    return {
      service_category,
      sample_size: sampleSize,
      coverage: {
        pickup_sla_orders: toNumber(row.pickup_sla_eligible),
        delivery_sla_orders: toNumber(row.delivery_sla_eligible),
        failed_delivery_orders: toNumber(row.failed_delivery_orders),
        pod_orders: toNumber(row.pod_eligible),
      },
      metrics: {
        match_rate_pct: toNullableMetric(row.matched_orders, row.sample_size),
        pickup_sla_compliance_pct: toNullableMetric(row.pickup_sla_met, row.pickup_sla_eligible),
        delivery_sla_compliance_pct: toNullableMetric(row.delivery_sla_met, row.delivery_sla_eligible),
        failed_delivery_rate_pct: toNullableMetric(row.failed_delivery_orders, row.sample_size),
        recovery_path_rate_pct: toNullableMetric(row.recovery_orders, row.failed_delivery_orders),
        pod_issue_rate_pct: toNullableMetric(row.pod_issue_orders, row.pod_eligible),
      },
    };
  }

  if (service_category === 'food') {
    return {
      service_category,
      sample_size: sampleSize,
      coverage: {
        response_orders: toNumber(row.response_eligible),
        prep_orders: toNumber(row.prep_eligible),
        wait_orders: toNumber(row.wait_eligible),
        handoff_orders: toNumber(row.handoff_eligible),
        refund_orders: toNumber(row.refund_eligible),
      },
      metrics: {
        merchant_response_rate_pct: toNullableMetric(row.responded_orders, row.response_eligible),
        merchant_response_minutes: toNullableAverage(row.response_minutes),
        prep_accuracy_pct: toNullableMetric(row.prep_on_time, row.prep_eligible),
        average_wait_minutes: toNullableAverage(row.wait_minutes),
        handoff_success_rate_pct: toNullableMetric(row.handoff_success, row.handoff_eligible),
        refund_rate_pct: toNullableMetric(row.refunded_orders, row.refund_eligible),
      },
    };
  }

  if (service_category === 'tambal_ban') {
    return {
      service_category,
      sample_size: sampleSize,
      coverage: {
        technician_match_orders: toNumber(row.technician_match_eligible),
        onsite_orders: toNumber(row.onsite_eligible),
        adjustment_orders: sampleSize,
        claim_orders: sampleSize,
      },
      metrics: {
        technician_match_rate_pct: toNullableMetric(row.technician_matched, row.technician_match_eligible),
        technician_eta_minutes: toNullableAverage(row.eta_minutes),
        onsite_completion_rate_pct: toNullableMetric(row.onsite_completed, row.onsite_eligible),
        adjustment_rate_pct: toNullableMetric(row.adjusted_orders, row.sample_size),
        claim_rate_pct: toNullableMetric(row.claimed_orders, row.sample_size),
      },
    };
  }

  if (service_category === 'aggregator') {
    return {
      service_category,
      sample_size: sampleSize,
      coverage: {
        provider_rate_orders: toNumber(row.provider_rate_eligible),
        awb_attempts: toNumber(row.awb_attempt_eligible),
        webhook_events: toNumber(row.webhook_freshness_eligible),
        carrier_sla_orders: toNumber(row.carrier_sla_eligible),
        exception_orders: toNumber(row.exception_orders),
        reconciliation_orders: toNumber(row.reconciliation_eligible),
      },
      metrics: {
        provider_rate_success_pct: toNullableMetric(row.provider_rate_success, row.provider_rate_eligible),
        awb_failure_rate_pct: toNullableMetric(row.awb_failed, row.awb_attempt_eligible),
        webhook_freshness_pct: toNullableMetric(row.webhook_fresh, row.webhook_freshness_eligible),
        carrier_sla_compliance_pct: toNullableMetric(row.carrier_sla_met, row.carrier_sla_eligible),
        return_lost_damaged_rate_pct: toNullableMetric(row.exception_orders, row.sample_size),
        cod_claim_reconciliation_pct: toNullableMetric(row.reconciliation_resolved, row.reconciliation_eligible),
      },
      provider_mix: parseProviderMix(row.provider_mix),
    };
  }

  return {
    service_category,
    sample_size: sampleSize,
    coverage: {
      operator_match_orders: toNumber(row.operator_match_eligible),
      loading_orders: toNumber(row.loading_eligible),
      transit_orders: toNumber(row.transit_eligible),
      adjustment_orders: sampleSize,
      damage_claim_orders: sampleSize,
    },
    metrics: {
      operator_match_rate_pct: toNullableMetric(row.operator_matched, row.operator_match_eligible),
      operator_arrival_minutes: toNullableAverage(row.arrival_minutes),
      loading_completion_rate_pct: toNullableMetric(row.loading_completed, row.loading_eligible),
      transit_completion_rate_pct: toNullableMetric(row.transit_completed, row.transit_eligible),
      adjustment_rate_pct: toNullableMetric(row.adjusted_orders, row.sample_size),
      damage_claim_rate_pct: toNullableMetric(row.damage_claim_orders, row.sample_size),
    },
  };
};

export const SERVICE_KPI_DEFINITIONS = {
  package_on_demand: {
    match_rate_pct: 'Order dengan assigned_at atau accepted courier offer / seluruh order Paket pada window.',
    pickup_sla_compliance_pct: 'Pickup leg dengan sla_deadline tanpa sla_logs breach / pickup leg yang memiliki deadline.',
    delivery_sla_compliance_pct: 'Final leg selesai sebelum atau pada sla_deadline / final leg yang memiliki deadline.',
    failed_delivery_rate_pct: 'Order berstatus failed_delivery / seluruh order Paket pada window.',
    recovery_path_rate_pct: 'Failed delivery yang memiliki return/recovery event atau status return_to_sender / failed delivery.',
    pod_issue_rate_pct: 'Delivered tanpa accepted delivery proof / order delivered.',
  },
  food: {
    merchant_response_rate_pct: 'Order Food dengan merchant_accepted_at / order Food dengan response window.',
    merchant_response_minutes: 'Rata-rata menit dari order dibuat ke merchant_accepted_at.',
    prep_accuracy_pct: 'Food ready pada atau sebelum merchant accepted + prep_time_minutes / order prep yang memiliki fakta lengkap.',
    average_wait_minutes: 'Rata-rata menit dari food_ready_at ke picked_up_at pada order dengan kedua timestamp.',
    handoff_success_rate_pct: 'Order Food siap yang memiliki picked_up_at / order Food dengan food_ready_at.',
    refund_rate_pct: 'Order Food dengan refund non-failed / seluruh order Food pada window.',
  },
  tambal_ban: {
    technician_match_rate_pct: 'Order Tambal dengan courier pada leg pertama / order yang memiliki technician match denominator.',
    technician_eta_minutes: 'Rata-rata menit dari leg assigned_at ke started_at.',
    onsite_completion_rate_pct: 'Order dengan tambal_ban_reports.completed_at / order dengan technician match.',
    adjustment_rate_pct: 'Order dengan service_adjustments / seluruh order Tambal.',
    claim_rate_pct: 'Order dengan roadside_service_claims / seluruh order Tambal.',
  },
  aggregator: {
    provider_rate_success_pct: 'Order Aggregator dengan provider dan logistics_tariff_idr / order dengan provider rate attempt.',
    awb_failure_rate_pct: 'Order dengan aggregator_awb_attempts status failed / order dengan AWB attempt.',
    webhook_freshness_pct: 'Carrier event diterima maksimal 15 menit setelah provider timestamp / event dengan provider timestamp.',
    carrier_sla_compliance_pct: 'Final carrier leg selesai sebelum deadline / carrier leg dengan deadline.',
    return_lost_damaged_rate_pct: 'Order dengan provider exception RETURN/LOST_CLAIM/DAMAGED_CLAIM / order Aggregator.',
    cod_claim_reconciliation_pct: 'Invoice/claim order yang accepted/reconciled / order invoice/claim yang memiliki record; COD hanya dihitung bila provider menyimpan record claim/invoice.',
  },
  towing: {
    operator_match_rate_pct: 'Order Towing dengan operator pada leg pertama / order dengan operator-match denominator.',
    operator_arrival_minutes: 'Rata-rata menit dari leg assigned_at ke started_at.',
    loading_completion_rate_pct: 'Order dengan towing_reports.loading_started_at / order dengan operator match.',
    transit_completion_rate_pct: 'Order dengan transit_ended_at / order dengan transit_started_at.',
    adjustment_rate_pct: 'Order dengan service_adjustments / seluruh order Towing.',
    damage_claim_rate_pct: 'Order dengan towing_damage_claims / seluruh order Towing.',
  },
} as const;

const queryFirstRow = async (sql: string, params: [Date, Date]): Promise<QueryRow> => {
  const result = await readDb.query(sql, params);
  return result.rows[0] || {};
};

export const getServiceKpis = async (window: ServiceKpiWindow): Promise<ServiceKpi[]> => {
  try {
    const params: [Date, Date] = [window.from, window.to];
    const [packageRow, foodRow, tambalRow, aggregatorRow, towingRow] = await Promise.all([
      queryFirstRow(PACKAGE_QUERY, params),
      queryFirstRow(FOOD_QUERY, params),
      queryFirstRow(TAMBAL_QUERY, params),
      queryFirstRow(AGGREGATOR_QUERY, params),
      queryFirstRow(TOWING_QUERY, params),
    ]);
    return [
      serviceKpiFromRow('package_on_demand', packageRow),
      serviceKpiFromRow('food', foodRow),
      serviceKpiFromRow('tambal_ban', tambalRow),
      serviceKpiFromRow('aggregator', aggregatorRow),
      serviceKpiFromRow('towing', towingRow),
    ];
  } catch (error) {
    securityLog.error('Service KPI query failed:', error);
    throw error;
  }
};
