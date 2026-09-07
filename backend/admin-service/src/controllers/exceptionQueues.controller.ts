import { Request, Response } from 'express';
import { readDb } from '../db';
import { securityLog } from '../security/logRedaction';

const EXCEPTION_CATEGORIES = new Set([
  'no_supply',
  'payment_sla',
  'payment_dispatch_mismatch',
  'awb_provider_failure',
  'carrier_event_anomaly',
  'merchant_timeout',
  'service_adjustment_pending',
  'missing_proof',
  'reconciliation_mismatch',
]);

/**
 * Read-only operational queue. Every row is derived from an authoritative
 * order/financial/provider record; the dashboard never creates exception
 * state client-side.
 */
export const listOrderExceptions = async (req: Request, res: Response): Promise<void> => {
  const requestedCategory = String(req.query.category || '').trim();
  const category = EXCEPTION_CATEGORIES.has(requestedCategory) ? requestedCategory : '';
  const requestedLimit = Number.parseInt(String(req.query.limit || '100'), 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 250) : 100;

  try {
    const result = await readDb.query(`
      WITH carrier_ordered AS (
        SELECT
          cei.*,
          LAG(COALESCE(cei.occurred_at, cei.received_at)) OVER (
            PARTITION BY cei.provider, cei.awb_number
            ORDER BY cei.received_at ASC, cei.id ASC
          ) AS previous_occurred_at
        FROM carrier_event_inbox cei
      ),
      exception_feed AS (
        -- No courier/technician/operator after dispatch has started.
        SELECT
          'no_supply'::text AS category,
          CASE
            WHEN o.service_category IN ('tambal_ban', 'towing') THEN 'No technician/operator'
            ELSE 'No courier'
          END::text AS title,
          CASE
            WHEN o.service_category IN ('tambal_ban', 'towing') THEN 'Teknisi/operator belum ter-assign'
            ELSE 'Kurir belum ter-assign'
          END::text AS summary,
          'high'::text AS severity,
          o.id::text AS order_id,
          o.order_number::text AS order_number,
          o.status::text AS order_status,
          NULL::text AS provider,
          COALESCE(o.updated_at, o.created_at) AS occurred_at,
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(o.updated_at, o.created_at))) / 60))::int AS age_minutes,
          'Re-dispatch dan cek supply di zona layanan.'::text AS next_action
        FROM orders o
        WHERE LOWER(o.status) IN ('searching', 'pending_assignment', 'no_courier_found', 'dispatching', 'offered', 'matched')
          AND COALESCE(o.updated_at, o.created_at) < NOW() - INTERVAL '5 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM order_legs ol
            WHERE ol.order_id = o.id AND ol.courier_id IS NOT NULL
          )

        UNION ALL

        -- Payment has remained pending beyond the operational SLA.
        SELECT
          'payment_sla'::text,
          'Payment pending SLA breach'::text,
          'Pembayaran belum selesai melewati SLA 15 menit.'::text,
          'critical'::text,
          o.id::text,
          o.order_number::text,
          o.status::text,
          p.provider::text,
          COALESCE(p.created_at, o.created_at),
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(p.created_at, o.created_at))) / 60))::int,
          'Hubungi customer atau batalkan payment session yang kedaluwarsa.'::text
        FROM orders o
        JOIN LATERAL (
          SELECT p1.* FROM payments p1
          WHERE p1.order_id = o.id
          ORDER BY p1.updated_at DESC, p1.created_at DESC
          LIMIT 1
        ) p ON TRUE
        WHERE LOWER(p.status) = 'pending'
          AND COALESCE(p.created_at, o.created_at) < NOW() - INTERVAL '15 minutes'

        UNION ALL

        -- Payment/order state disagree at the create or dispatch boundary.
        SELECT
          'payment_dispatch_mismatch'::text,
          'Paid/create/dispatch mismatch'::text,
          CASE
            WHEN LOWER(p.status) IN ('paid', 'settled') AND LOWER(o.status) = 'pending_payment'
              THEN 'Payment paid tetapi order masih pending_payment.'
            ELSE 'Order paid tetapi belum memiliki payment paid/settled.'
          END::text,
          'critical'::text,
          o.id::text,
          o.order_number::text,
          o.status::text,
          p.provider::text,
          COALESCE(p.updated_at, o.updated_at, o.created_at),
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(p.updated_at, o.updated_at, o.created_at))) / 60))::int,
          'Audit payment callback dan jalankan recovery order melalui service owner.'::text
        FROM orders o
        JOIN LATERAL (
          SELECT p1.* FROM payments p1
          WHERE p1.order_id = o.id
          ORDER BY p1.updated_at DESC, p1.created_at DESC
          LIMIT 1
        ) p ON TRUE
        WHERE (
          (LOWER(p.status) IN ('paid', 'settled') AND LOWER(o.status) = 'pending_payment')
          OR (LOWER(o.status) = 'paid' AND LOWER(p.status) NOT IN ('paid', 'settled'))
        )

        UNION ALL

        -- Durable AWB failure is the source of truth for provider failure.
        -- A circuit-open error is surfaced as such when the provider recorded it.
        SELECT
          'awb_provider_failure'::text,
          CASE WHEN LOWER(COALESCE(a.error_message, '')) LIKE '%circuit%open%'
            THEN 'Provider circuit open' ELSE 'AWB create failed' END::text,
          COALESCE(a.error_message, 'Provider gagal membuat AWB.')::text,
          'critical'::text,
          o.id::text,
          o.order_number::text,
          o.status::text,
          a.provider::text,
          a.updated_at,
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - a.updated_at)) / 60))::int,
          'Retry AWB dengan idempotency key yang sama setelah provider pulih.'::text
        FROM aggregator_awb_attempts a
        JOIN orders o ON o.id = a.order_id
        WHERE a.status = 'failed'

        UNION ALL

        -- UNKNOWN events and events whose provider timestamp moved backwards.
        SELECT
          'carrier_event_anomaly'::text,
          CASE WHEN c.canonical_status = 'UNKNOWN' THEN 'Unknown carrier event' ELSE 'Out-of-order carrier event' END::text,
          CASE WHEN c.canonical_status = 'UNKNOWN'
            THEN 'Status provider tidak dikenal; raw event dipertahankan.'
            ELSE 'Timestamp provider lebih lama dari event sebelumnya.' END::text,
          'high'::text,
          o.id::text,
          o.order_number::text,
          o.status::text,
          c.provider::text,
          c.received_at,
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - c.received_at)) / 60))::int,
          'Tahan transisi otomatis dan review raw event/provider mapping.'::text
        FROM carrier_ordered c
        LEFT JOIN orders o ON o.awb_number = c.awb_number
        WHERE c.canonical_status = 'UNKNOWN'
           OR (
             c.occurred_at IS NOT NULL
             AND c.previous_occurred_at IS NOT NULL
             AND c.occurred_at < c.previous_occurred_at
           )

        UNION ALL

        -- Merchant response and preparation readiness are separate timeout states.
        SELECT
          'merchant_timeout'::text,
          CASE WHEN LOWER(o.status) = 'pending_merchant' THEN 'Merchant response timeout' ELSE 'Merchant readiness timeout' END::text,
          CASE WHEN LOWER(o.status) = 'pending_merchant'
            THEN 'Merchant belum menerima order dalam 3 menit.'
            ELSE 'Waktu siap makanan sudah terlewati.' END::text,
          'high'::text,
          o.id::text,
          o.order_number::text,
          o.status::text,
          NULL::text,
          COALESCE(o.merchant_accepted_at, o.food_ready_at, o.updated_at, o.created_at),
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(o.merchant_accepted_at, o.food_ready_at, o.updated_at, o.created_at))) / 60))::int,
          'Cek merchant readiness; auto-cancel/reassign mengikuti policy food.'::text
        FROM orders o
        WHERE (
          (LOWER(o.status) = 'pending_merchant' AND COALESCE(o.updated_at, o.created_at) < NOW() - INTERVAL '3 minutes')
          OR (LOWER(o.status) = 'preparing' AND o.food_ready_at IS NOT NULL AND o.food_ready_at < NOW() - INTERVAL '5 minutes')
        )

        UNION ALL

        SELECT
          'service_adjustment_pending'::text,
          'Service adjustment awaiting approval'::text,
          'Penyesuaian biaya menunggu keputusan customer.'::text,
          'high'::text,
          o.id::text,
          o.order_number::text,
          o.status::text,
          NULL::text,
          a.created_at,
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - a.created_at)) / 60))::int,
          'Minta keputusan customer atau eskalasi ke operator service.'::text
        FROM service_adjustments a
        JOIN orders o ON o.id = a.order_id
        WHERE a.status = 'pending'

        UNION ALL

        -- Delivered/completed without an accepted delivery proof.
        SELECT
          'missing_proof'::text,
          'Missing proof'::text,
          'Order terminal belum memiliki bukti delivery yang diterima.'::text,
          'critical'::text,
          o.id::text,
          o.order_number::text,
          o.status::text,
          NULL::text,
          COALESCE(o.delivered_at, o.updated_at, o.created_at),
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(o.delivered_at, o.updated_at, o.created_at))) / 60))::int,
          'Tahan settlement dan minta POD/proof review sebelum release.'::text
        FROM orders o
        WHERE LOWER(o.status) IN ('delivered', 'completed')
          AND NOT EXISTS (
            SELECT 1 FROM courier_proof_attempts cpa
            WHERE cpa.order_id = o.id
              AND cpa.proof_step = 'delivery'
              AND cpa.proof_status = 'accepted'
          )
          AND NOT EXISTS (
            SELECT 1 FROM package_scans ps
            WHERE ps.order_id = o.id
              AND LOWER(ps.scan_type) IN ('delivered', 'pod')
          )

        UNION ALL

        SELECT
          'reconciliation_mismatch'::text,
          'Completed but reconciliation mismatch'::text,
          fre.reason::text,
          'critical'::text,
          CASE WHEN o.id IS NULL THEN NULL ELSE o.id::text END,
          o.order_number::text,
          o.status::text,
          fre.provider::text,
          fre.last_seen_at,
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - fre.last_seen_at)) / 60))::int,
          'Tahan payout/settlement dan lakukan rekonsiliasi berbasis exception_key.'::text
        FROM finance_reconciliation_exceptions fre
        LEFT JOIN orders o ON o.id::text = fre.reference_id AND fre.reference_type = 'order'
        WHERE fre.status IN ('open', 'under_review')
      )
      SELECT
        category,
        title,
        summary,
        severity,
        order_id,
        order_number,
        order_status,
        provider,
        occurred_at,
        age_minutes,
        next_action,
        COUNT(*) OVER()::int AS total
      FROM exception_feed
      WHERE ($1 = '' OR category = $1)
      ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
        occurred_at ASC
      LIMIT $2
    `, [category, limit]);

    const total = result.rows.length > 0 ? Number(result.rows[0].total) : 0;
    res.json({ data: result.rows, total, limit, category: category || null });
  } catch (error: any) {
    securityLog.error('Failed to load admin order exception queue', { error });
    res.status(500).json({ error: 'Operational exception queue unavailable' });
  }
};
