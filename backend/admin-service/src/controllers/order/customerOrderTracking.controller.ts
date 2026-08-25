import { Request, Response } from 'express';
import { securityLog } from '../../security/logRedaction';

import type { PoolClient } from 'pg';
import { db } from '../../db';

import { createNotification } from '../../notifications';
import { createSnapTransaction, getMidtransClientKey, getMidtransSnapJsUrl } from '../../midtrans';

import { isExpiredOrFailedTransaction, isSuccessfulTransaction } from '../../midtrans';
import { calculateServiceSettlement, customerFacingService, DeliveryServiceProduct, findDeliveryServiceByCode, listEnabledDeliveryServicesForCustomer } from '../deliveryServices.controller';

import { advanceOnDemandDispatchQueue, dispatchToPreferredCourier, notifyOnDemandOffers } from '../courierAuth.controller';
import { redis } from '../../redis';

import { ON_DEMAND_REALTIME_EVENTS, emitOnDemandRealtime } from '../../services/onDemandRealtime';
import { buildOnDemandTrackingSnapshot, evaluateLocationQuality, writeLocationSafetyEvent } from '../../services/onDemandTracking';

import { evaluateOnDemandRealtimeAlerts } from '../../services/realtimeObservability';
import { buildMapsRouteEtaSnapshot, RouteEtaSnapshot } from '../../services/mapsProviderConfig';

import { enqueueOutboxEvent } from '../../services/eventOutbox';
import {
  createOrderCallSession,
  endOrderCallSession,
  errorStatusCode,
  joinOrderCallSession,
  listConversationChats,
  markConversationRead,
  revokeReceiverLocationInvite,
  sendConversationChat,
} from '../../services/orderCommunication';

import crypto from 'crypto';
import { saveSecureUploadBuffer } from '../../security/uploadSecurity';

import { releasePromoReservation, validatePromoForCheckout } from '../../services/promoEngine';
import {
  insertWebhookAuditEvent,
  resolveRawBody,
  updateWebhookAuditEvent,
  verifyMidtransSignature,
} from '../../security/webhookSecurity';




import {
  customerOrderStatusLabel,
  getCustomerReportRange,
  publicBaseUrl,
  publicCustomerInvoice,
  sha256,
} from './_shared';

export const getOrderTracking = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const orderId = String(req.query.order_id || req.query.orderId || '');

    if (!userId) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
      return;
    }

    if (!orderId) {
      res.status(400).json({ success: false, data: null, message: 'order_id wajib diisi' });
      return;
    }

    const tracking = await buildOnDemandTrackingSnapshot(db, {
      orderId,
      userId,
      role: req.user?.role,
    });

    if (!tracking) {
      res.status(404).json({ success: false, data: null, message: 'Order tidak ditemukan atau akses ditolak' });
      return;
    }

    if (!tracking.location) {
      res.status(404).json({ success: false, data: null, message: 'Lokasi kurir belum tersedia' });
      return;
    }

    res.json({
      success: true,
      data: tracking,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};



export const syncCourierTracking = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const requestedCourierId = req.body?.courier_id || req.body?.courierId;
  const deviceId = req.body?.device_id || req.body?.deviceId || null;
  const locations = Array.isArray(req.body?.locations) ? req.body.locations : [];

  if (!userId) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    return;
  }

  if (requestedCourierId && requestedCourierId !== userId) {
    res.status(403).json({ success: false, data: null, message: 'Courier token tidak sesuai dengan payload lokasi' });
    return;
  }

  if (locations.length === 0) {
    res.json({ success: true, data: { success: true, syncedCount: 0, message: 'Tidak ada lokasi baru' } });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: courierRows } = await client.query(
      `SELECT id, user_id FROM courier_profiles WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (courierRows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, data: null, message: 'Profil kurir tidak ditemukan' });
      return;
    }

    const courierProfile = courierRows[0];
    let syncedCount = 0;
    let acceptedCount = 0;
    let rejectedCount = 0;
    let duplicateCount = 0;
    let latestPayload: Record<string, any> | null = null;

    for (const item of locations) {
      const latitude = Number(item.latitude);
      const longitude = Number(item.longitude);
      const orderId = item.order_id || item.orderId || null;
      const recordedAt = item.timestamp ? new Date(item.timestamp) : new Date();
      const heading = Number(item.heading ?? item.bearing ?? 0);
      const speed = Number(item.speed ?? 0);
      const accuracy = Number(item.accuracy ?? item.accuracy_m ?? 0);
      const clientLocationId = item.client_location_id || item.clientLocationId || null;

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        continue;
      }

      if (clientLocationId) {
        const { rows: duplicateRows } = await client.query(
          `SELECT 1
           FROM courier_locations
           WHERE courier_id = $1
             AND client_location_id = $2
           LIMIT 1`,
          [courierProfile.id, clientLocationId]
        );
        if (duplicateRows.length > 0) {
          duplicateCount += 1;
          syncedCount += 1;
          continue;
        }
      }

      const { rows: previousRows } = await client.query(
        `SELECT ST_Y(location::geometry) AS latitude,
                ST_X(location::geometry) AS longitude,
                accuracy_m,
                heading_deg,
                speed_kmh,
                recorded_at
         FROM courier_locations
         WHERE courier_id = $1
           AND COALESCE(is_spoofed, FALSE) = FALSE
         ORDER BY recorded_at DESC
         LIMIT 1`,
        [courierProfile.id]
      );
      const currentPoint = {
        latitude,
        longitude,
        heading: Number.isFinite(heading) ? heading : undefined,
        speed: Number.isFinite(speed) ? speed : undefined,
        accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
        timestamp: recordedAt.toISOString(),
      };
      const previousPoint = previousRows[0]
        ? {
            latitude: Number(previousRows[0].latitude),
            longitude: Number(previousRows[0].longitude),
            heading: Number(previousRows[0].heading_deg || 0),
            speed: Number(previousRows[0].speed_kmh || 0),
            accuracy: previousRows[0].accuracy_m == null ? undefined : Number(previousRows[0].accuracy_m),
            timestamp: previousRows[0].recorded_at,
          }
        : null;
      const quality = evaluateLocationQuality(currentPoint, previousPoint, {
        is_mock: Boolean(item.is_mock || item.isMock),
        is_rooted: Boolean(item.is_rooted || item.isRooted),
      });

      if (orderId) {
        const { rows: accessRows } = await client.query(
          `SELECT o.customer_id, ol.courier_id
           FROM orders o
           JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
           WHERE o.id = $1 AND ol.courier_id = $2
           LIMIT 1`,
          [orderId, userId]
        );

        if (accessRows.length === 0) {
          continue;
        }

        await writeLocationSafetyEvent(client, {
          order_id: orderId,
          courier_id: userId,
          location: currentPoint,
          quality,
          device_id: deviceId,
        });

        if (quality.accepted) {
          latestPayload = {
            order_id: orderId,
            courier_id: courierProfile.id,
            courier_user_id: userId,
            customer_id: accessRows[0].customer_id,
            device_id: deviceId,
            location: currentPoint,
          };
        }
      }

      await client.query(
        `INSERT INTO courier_locations (
           courier_id, order_id, location, accuracy_m, heading_deg, speed_kmh, is_spoofed, recorded_at, client_location_id, device_id
         )
         VALUES (
           $1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, $6, $7, $8, $9, $10, $11
         )`,
        [
          courierProfile.id,
          orderId,
          longitude,
          latitude,
          Number.isFinite(accuracy) ? accuracy : null,
          Number.isFinite(heading) ? heading : null,
          Number.isFinite(speed) ? speed : null,
          quality.is_spoofed,
          recordedAt,
          clientLocationId,
          deviceId,
        ]
      );

      if (quality.accepted) {
        await client.query(
          `UPDATE courier_profiles
           SET current_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
               last_location_at = GREATEST(COALESCE(last_location_at, $3), $3),
               updated_at = NOW()
           WHERE id = $4`,
          [longitude, latitude, recordedAt, courierProfile.id]
        );
        acceptedCount += 1;
      } else {
        rejectedCount += 1;
      }

      syncedCount += 1;
    }

    await client.query('COMMIT');

    if (latestPayload) {
      emitOnDemandRealtime(ON_DEMAND_REALTIME_EVENTS.TRACKING_UPDATED, {
        order_id: latestPayload.order_id,
        customer_id: latestPayload.customer_id,
        courier_user_id: latestPayload.courier_user_id,
        courier_profile_id: latestPayload.courier_id,
        stage: 'tracking',
        location: latestPayload.location,
        metadata: { device_id: latestPayload.device_id },
      });
      void evaluateOnDemandRealtimeAlerts(db);
    }

    res.json({
      success: true,
      data: {
        success: true,
        syncedCount,
        acceptedCount,
        rejectedCount,
        duplicateCount,
        message: `${syncedCount} lokasi tersinkronisasi`,
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, data: null, message: error.message });
  } finally {
    client.release();
  }
};



export const getMobileCustomerOrderTrackingDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const customer_id = req.user?.id;
    const { id } = req.params;
    if (!customer_id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
      return;
    }

    const orderQuery = `
      SELECT o.id, o.order_number, o.pickup_address, o.dropoff_address, o.recipient_name,
             o.recipient_phone_masked, o.model, o.status, o.distance_km, o.total_price_idr,
             o.route_snapshot, o.route_provider, o.route_profile, o.route_polyline,
             COALESCE(o.route_distance_meters, NULLIF(o.route_snapshot->>'distance_meters', '')::int, 0)::int AS route_distance_meters,
             COALESCE(o.route_duration_seconds, NULLIF(o.route_snapshot->>'duration_seconds', '')::int, 0)::int AS route_duration_seconds,
             COALESCE(NULLIF(o.route_snapshot->>'eta_minutes', '')::int, 0)::int AS eta_minutes,
             o.package_details, o.customer_notes, o.created_at, o.updated_at,
             p.status AS payment_status,
             p.provider AS payment_provider,
             p.method AS payment_method,
             p.amount_idr AS payment_amount_idr,
             p.paid_at,
             p.provider_reference,
             COALESCE(o.order_notes, '') AS order_notes,
             COALESCE(o.service_sub_type, '') AS service_sub_type,
             COALESCE(m.nama_toko, '') AS merchant_name,
             u.full_name as courier_name, cp.vehicle_type as courier_vehicle, cp.vehicle_plate as courier_plate,
             cp.avg_partner_rating as courier_rating, NULL::text as courier_phone,
             u.photo_url AS courier_photo_url
      FROM orders o
      LEFT JOIN merchants m ON m.id = o.merchant_id
      LEFT JOIN order_legs ol ON o.id = ol.order_id AND ol.leg_number = 1
      LEFT JOIN users u ON ol.courier_id = u.id
      LEFT JOIN courier_profiles cp ON u.id = cp.user_id
      LEFT JOIN LATERAL (
        SELECT status, provider, method, amount_idr, paid_at, provider_reference
        FROM payments
        WHERE order_id = o.id
        ORDER BY created_at DESC
        LIMIT 1
      ) p ON TRUE
      WHERE o.customer_id = $1 AND o.id = $2
    `;
    const { rows } = await db.query(orderQuery, [customer_id, id]);
    if (rows.length === 0) {
      res.status(404).json({ success: false, data: null, message: 'Order tidak ditemukan' });
      return;
    }

    const { rows: events } = await db.query(`
      SELECT id, event_type, description, metadata, created_at
      FROM order_events
      WHERE order_id = $1
      ORDER BY created_at ASC
    `, [id]);

    const { rows: packages } = await db.query(`
      SELECT id AS package_id,
             package_index,
             package_code,
             description,
             size_tier,
             weight_kg,
             status,
             pickup_scan_verified_at,
             pickup_photo_verified_at,
             delivery_pod_verified_at
      FROM order_packages
      WHERE order_id = $1
      ORDER BY package_index ASC
    `, [id]);

    const { rows: proofs } = await db.query(`
      SELECT id,
             CASE
               WHEN COALESCE(override_reason, '') ILIKE 'pickup_cancellation:%' THEN 'pickup_cancellation'
               WHEN scanned_by_role = 'courier' AND image_urls IS NOT NULL AND array_length(image_urls, 1) > 0 THEN 'pickup_photo'
               WHEN scanned_by_role = 'courier' THEN 'pickup_scan'
               ELSE 'operational'
             END AS scan_type,
             CASE
               WHEN COALESCE(override_reason, '') ILIKE 'pickup_cancellation:%' THEN 'Bukti pembatalan pickup'
               WHEN scanned_by_role = 'courier' AND image_urls IS NOT NULL AND array_length(image_urls, 1) > 0 THEN 'Foto barang pickup'
               WHEN scanned_by_role = 'courier' THEN 'Scan pickup'
               ELSE 'Bukti operasional'
             END AS proof_label,
             CASE
               WHEN COALESCE(override_reason, '') ILIKE 'pickup_cancellation:%' THEN 'cancellation'
               WHEN scanned_by_role = 'courier' THEN 'pickup'
               ELSE 'operational'
             END AS proof_category,
             CASE
               WHEN image_urls IS NOT NULL AND array_length(image_urls, 1) > 0 THEN image_urls[1]
               ELSE NULL
             END AS photo_url,
             image_urls,
             override_reason,
             CASE
               WHEN COALESCE(override_reason, '') ILIKE 'pickup_cancellation:%' THEN SPLIT_PART(COALESCE(override_reason, ''), ':', 1)
               ELSE NULL
             END AS reason_code,
             CASE
               WHEN COALESCE(override_reason, '') ILIKE 'pickup_cancellation:%' AND COALESCE(override_reason, '') LIKE '%:%'
                 THEN NULLIF(TRIM(REGEXP_REPLACE(override_reason, '^[^:]+:\\s*', '')), '')
               ELSE NULL
             END AS reason_note,
             CASE WHEN scan_location IS NOT NULL THEN ST_Y(scan_location::geometry) ELSE NULL END AS latitude,
             CASE WHEN scan_location IS NOT NULL THEN ST_X(scan_location::geometry) ELSE NULL END AS longitude,
             COALESCE(scanned_at, created_at) AS recorded_at
      FROM package_scans
      WHERE order_id = $1
      ORDER BY COALESCE(scanned_at, created_at) ASC
    `, [id]);

    const { rows: foodItems } = await db.query(`
      SELECT foi.item_name AS name,
             foi.quantity,
             foi.notes,
             foi.item_price AS price,
             foi.subtotal,
             mm.foto AS photo_url,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'variant_id', foiv.variant_id,
                 'variant_name', foiv.variant_name,
                 'option_name', foiv.option_name,
                 'price_delta', foiv.price_delta
               ) ORDER BY foiv.id)
               FROM food_order_item_variants foiv
               WHERE foiv.order_item_id = foi.id
             ), '[]'::jsonb) AS variants
      FROM food_order_items foi
      LEFT JOIN merchant_menu_items mm ON mm.id = foi.menu_item_id
      WHERE order_id = $1
      ORDER BY foi.id ASC
    `, [id]);

    const { rows: tambalBanReports } = await db.query(`
      SELECT *
      FROM tambal_ban_reports
      WHERE order_id = $1
      LIMIT 1
    `, [id]);

    const { rows: towingReports } = await db.query(`
      SELECT *
      FROM towing_reports
      WHERE order_id = $1
      LIMIT 1
    `, [id]);

    const tracking = await buildOnDemandTrackingSnapshot(db, {
      orderId: String(id),
      userId: String(customer_id),
      role: req.user?.role,
    });

    const order = {
      ...rows[0],
      status_label: customerOrderStatusLabel(rows[0].status, rows[0].service_sub_type),
      invoice: publicCustomerInvoice(rows[0]),
      food_items: foodItems,
      tambal_ban_report: tambalBanReports[0] || null,
      towing_report: towingReports[0] || null,
    };

    res.json({
      success: true,
      data: {
        order,
        events,
        packages,
        proofs,
        tracking,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};



export const createCustomerPublicTrackingLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const orderId = String(req.params.id || '');

    if (!userId) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
      return;
    }

    const { rows } = await db.query(
      `SELECT o.id, o.status, ol.courier_id
       FROM orders o
       JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
       WHERE o.id = $1
         AND o.customer_id = $2
         AND LOWER(o.model) IN ('p2p', 'on_demand', 'ondemand')
         AND o.status NOT IN ('cancelled', 'failed')
       LIMIT 1`,
      [orderId, userId]
    );

    if (rows.length === 0) {
      res.status(404).json({ success: false, data: null, message: 'Order on-demand tidak ditemukan atau belum bisa dibagikan.' });
      return;
    }

    if (!rows[0].courier_id) {
      res.status(409).json({ success: false, data: null, message: 'Link tracking bisa dibuat setelah kurir menerima pekerjaan.' });
      return;
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO trip_share_tokens (order_id, courier_id, token_hash, expires_at, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        orderId,
        rows[0].courier_id,
        sha256(token),
        expiresAt,
        JSON.stringify({ source: 'customer_web', created_by: userId }),
      ]
    );

    res.json({
      success: true,
      data: {
        url: `${publicBaseUrl()}/track/${token}`,
        expires_at: expiresAt.toISOString(),
      },
      message: 'Link tracking publik dibuat.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};



export const getCustomerUmkmReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
      return;
    }

    const reportRange = getCustomerReportRange(req.query.period, req.query.start_date, req.query.end_date);
    if ('error' in reportRange) {
      res.status(400).json({ success: false, data: null, message: reportRange.error });
      return;
    }

    const queryParams = [customerId, reportRange.startDate, reportRange.endDateExclusive];

    const [summaryResult, trendResult, modelResult, zoneResult, exportResult] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)::int AS total_orders,
          COUNT(*) FILTER (WHERE LOWER(COALESCE(status::text, '')) IN ('delivered', 'completed', 'pod_completed'))::int AS completed_orders,
          COUNT(*) FILTER (WHERE LOWER(COALESCE(status::text, '')) IN ('cancelled', 'canceled', 'failed', 'rejected'))::int AS failed_orders,
          COALESCE(SUM(COALESCE(total_price_idr, 0)) FILTER (WHERE LOWER(COALESCE(status::text, '')) IN ('delivered', 'completed', 'pod_completed')), 0)::bigint AS total_spend,
          COALESCE(AVG(NULLIF(
            CASE
              WHEN COALESCE(package_details->>'weight_kg', '') ~ '^[0-9]+([.][0-9]+)?$'
                THEN (package_details->>'weight_kg')::numeric
              ELSE 0
            END,
            0
          )), 0)::numeric AS avg_weight,
          COALESCE(AVG(NULLIF(COALESCE(total_price_idr, 0), 0)), 0)::numeric AS avg_cost
        FROM orders
        WHERE customer_id = $1
          AND created_at >= $2::date
          AND created_at < $3::date
      `, queryParams),
      db.query(`
        WITH days AS (
          SELECT generate_series($2::date, ($3::date - INTERVAL '1 day')::date, INTERVAL '1 day')::date AS day
        ),
        daily_orders AS (
          SELECT
            created_at::date AS day,
            COUNT(*)::int AS order_count,
            COALESCE(SUM(COALESCE(total_price_idr, 0)) FILTER (WHERE LOWER(COALESCE(status::text, '')) IN ('delivered', 'completed', 'pod_completed')), 0)::bigint AS total_spend
          FROM orders
          WHERE customer_id = $1
            AND created_at >= $2::date
            AND created_at < $3::date
          GROUP BY 1
        )
        SELECT
          days.day::text AS date,
          TO_CHAR(days.day, 'DD Mon') AS label,
          COALESCE(daily_orders.order_count, 0)::int AS order_count,
          COALESCE(daily_orders.total_spend, 0)::bigint AS total_spend
        FROM days
        LEFT JOIN daily_orders ON daily_orders.day = days.day
        ORDER BY days.day ASC
      `, queryParams),
      db.query(`
        SELECT
          COALESCE(NULLIF(INITCAP(REPLACE(COALESCE(model::text, ''), '_', ' ')), ''), 'Tidak tersedia') AS name,
          COUNT(*)::int AS count,
          COALESCE(SUM(COALESCE(total_price_idr, 0)) FILTER (WHERE LOWER(COALESCE(status::text, '')) IN ('delivered', 'completed', 'pod_completed')), 0)::bigint AS total_spend
        FROM orders
        WHERE customer_id = $1
          AND created_at >= $2::date
          AND created_at < $3::date
        GROUP BY 1
        ORDER BY count DESC, name ASC
      `, queryParams),
      db.query(`
        SELECT
          COALESCE(
            NULLIF(TRIM(SPLIT_PART(COALESCE(dropoff_address, ''), ',', 2)), ''),
            NULLIF(TRIM(SPLIT_PART(COALESCE(dropoff_address, ''), ',', 1)), ''),
            'Tujuan tidak tersedia'
          ) AS zone,
          COUNT(*)::int AS order_count,
          COALESCE(SUM(COALESCE(total_price_idr, 0)) FILTER (WHERE LOWER(COALESCE(status::text, '')) IN ('delivered', 'completed', 'pod_completed')), 0)::bigint AS total_spend
        FROM orders
        WHERE customer_id = $1
          AND created_at >= $2::date
          AND created_at < $3::date
        GROUP BY 1
        ORDER BY order_count DESC, zone ASC
        LIMIT 5
      `, queryParams),
      db.query(`
        SELECT
          COALESCE(order_number, id::text) AS order_number,
          created_at::date::text AS order_date,
          COALESCE(recipient_name, '') AS recipient_name,
          COALESCE(dropoff_address, '') AS dropoff_address,
          CASE
            WHEN COALESCE(package_details->>'weight_kg', '') ~ '^[0-9]+([.][0-9]+)?$'
              THEN (package_details->>'weight_kg')::numeric
            ELSE 0
          END AS package_weight_kg,
          COALESCE(model::text, '') AS model,
          COALESCE(total_price_idr, 0)::bigint AS total_price_idr,
          COALESCE(status::text, '') AS status
        FROM orders
        WHERE customer_id = $1
          AND created_at >= $2::date
          AND created_at < $3::date
        ORDER BY created_at DESC
        LIMIT 1000
      `, queryParams),
    ]);

    const summary = summaryResult.rows[0] || {};
    const completedOrders = Number(summary.completed_orders || 0);
    const failedOrders = Number(summary.failed_orders || 0);
    const completedOrFailedOrders = completedOrders + failedOrders;

    res.json({
      success: true,
      data: {
        period: reportRange.period,
        range: {
          start_date: reportRange.startDate,
          end_date: reportRange.endDateInclusive,
        },
        summary: {
          total_orders: Number(summary.total_orders || 0),
          completed_orders: completedOrders,
          failed_orders: failedOrders,
          total_spend: Number(summary.total_spend || 0),
          completion_rate: completedOrFailedOrders > 0 ? Number(((completedOrders / completedOrFailedOrders) * 100).toFixed(1)) : null,
          on_time_rate: null,
          avg_weight: Number(Number(summary.avg_weight || 0).toFixed(2)),
          avg_cost: Math.round(Number(summary.avg_cost || 0)),
        },
        trend: trendResult.rows.map((row) => ({
          date: row.date,
          label: row.label,
          order_count: Number(row.order_count || 0),
          total_spend: Number(row.total_spend || 0),
        })),
        model_distribution: modelResult.rows.map((row) => ({
          name: row.name,
          count: Number(row.count || 0),
          total_spend: Number(row.total_spend || 0),
        })),
        destination_zones: zoneResult.rows.map((row) => ({
          zone: row.zone,
          order_count: Number(row.order_count || 0),
          total_spend: Number(row.total_spend || 0),
        })),
        export_rows: exportResult.rows.map((row) => ({
          no_order: row.order_number,
          tanggal: row.order_date,
          penerima: row.recipient_name,
          tujuan: row.dropoff_address,
          berat_kg: Number(row.package_weight_kg || 0),
          model: row.model,
          harga: Number(row.total_price_idr || 0),
          status: row.status,
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};



export const getCustomerDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const customer_id = req.user?.id;
    if (!customer_id) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
      return;
    }

    const { rows: summaryRows } = await db.query(`
      WITH current_month AS (
        SELECT
          COUNT(*) FILTER (WHERE status NOT IN ('delivered', 'completed', 'pod_completed', 'cancelled', 'failed'))::int AS active_orders,
          COUNT(*) FILTER (WHERE status IN ('delivered', 'completed', 'pod_completed'))::int AS completed_orders_month,
          COUNT(*) FILTER (WHERE status IN ('cancelled', 'failed'))::int AS cancelled_orders_month,
          COALESCE(SUM(total_price_idr) FILTER (WHERE status IN ('delivered', 'completed', 'pod_completed')), 0)::bigint AS total_spend_month
        FROM orders
        WHERE customer_id = $1
          AND created_at >= DATE_TRUNC('month', NOW())
      ),
      previous_month AS (
        SELECT
          COUNT(*)::int AS previous_orders_month,
          COALESCE(SUM(total_price_idr) FILTER (WHERE status IN ('delivered', 'completed', 'pod_completed')), 0)::bigint AS previous_spend_month
        FROM orders
        WHERE customer_id = $1
          AND created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
          AND created_at < DATE_TRUNC('month', NOW())
      )
      SELECT *
      FROM current_month, previous_month
    `, [customer_id]);

    const { rows: weeklyRows } = await db.query(`
      WITH weeks AS (
        SELECT generate_series(3, 0, -1) AS idx
      ),
      orders_by_week AS (
        SELECT
          FLOOR((NOW()::date - created_at::date) / 7.0)::int AS week_bucket,
          COUNT(*)::int AS count,
          COALESCE(SUM(total_price_idr) FILTER (WHERE status IN ('delivered', 'completed', 'pod_completed')), 0)::bigint AS value
        FROM orders
        WHERE customer_id = $1
          AND created_at >= NOW() - INTERVAL '28 days'
        GROUP BY 1
      )
      SELECT
        CONCAT('W', 4 - weeks.idx) AS label,
        COALESCE(obw.count, 0)::int AS count,
        COALESCE(obw.value, 0)::bigint AS value
      FROM weeks
      LEFT JOIN orders_by_week obw ON obw.week_bucket = weeks.idx
      ORDER BY weeks.idx DESC
    `, [customer_id]);

    const summary = summaryRows[0] || {};
    const totalSpend = Number(summary.total_spend_month || 0);
    const previousSpend = Number(summary.previous_spend_month || 0);
    const spendGrowth = previousSpend > 0 ? ((totalSpend - previousSpend) / previousSpend) * 100 : 0;

    res.json({
      success: true,
      data: {
        active_orders: Number(summary.active_orders || 0),
        completed_orders_month: Number(summary.completed_orders_month || 0),
        cancelled_orders_month: Number(summary.cancelled_orders_month || 0),
        total_spend_month: totalSpend,
        previous_spend_month: previousSpend,
        spend_growth_percent: Number(spendGrowth.toFixed(1)),
        weekly_activity: weeklyRows.map((row) => ({
          label: row.label,
          count: Number(row.count || 0),
          value: Number(row.value || 0),
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message });
  }
};


