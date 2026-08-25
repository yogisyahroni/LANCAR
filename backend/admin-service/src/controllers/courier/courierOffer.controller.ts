import { Request, Response } from 'express';
import { securityLog } from '../../security/logRedaction';

import { db } from '../../db';
import { createNotification } from '../../notifications';

import crypto from 'crypto';
import axios from 'axios';

import { evaluateCourierPayoutRisk } from '../../services/payoutRiskEngine';
import { decoratePayoutRequest, payoutMobileMessage } from '../../services/payoutStatusPolicy';

import { evaluatePayoutAlerts, writePayoutAuditEvent } from '../../utils/payoutObservability';
import { ON_DEMAND_REALTIME_EVENTS, emitOnDemandRealtime } from '../../services/onDemandRealtime';

import { evaluateOnDemandRealtimeAlerts } from '../../services/realtimeObservability';
import { buildMapsRouteEtaSnapshot } from '../../services/mapsProviderConfig';

import { isFeatureFlagEnabled } from '../../services/featureFlags';
import { saveSecureUploadBuffer } from '../../security/uploadSecurity';

import {
  AuthProtectionError,
  assertAuthAttemptAllowed,
  getRequestIpAddress,
  recordAuthFailure,
  recordAuthSuccess,
  sendAuthProtectionError,
} from '../../security/bruteForceProtection';


import { advanceOnDemandDispatchQueue } from './courierOnDemand.controller';
import { dispatchNextOnDemandCourier } from './courierOnDemand.controller';

import {
  CreatedDispatchOffer,
  ON_DEMAND_OFFER_TTL_SECONDS,
  expireStaleOnDemandOffers,
  mobileOrderSelect,
  normalizeMobileOrder,
  normalizeOfferMobileOrder,
  routeContractFromOrder,
} from './_shared';

export const notifyOnDemandOffers = async (offers: CreatedDispatchOffer[]) => {
  for (const offer of offers) {
    try {
      emitOnDemandRealtime(ON_DEMAND_REALTIME_EVENTS.OFFER_CREATED, {
        order_id: offer.order_id,
        courier_user_id: offer.courier_id,
        merchant_id: offer.merchant_id || null,
        admin_broadcast: true,
        status: 'offered',
        stage: 'offer_created',
        metadata: {
          dispatch_id: offer.dispatch_id,
          pickup_address: offer.pickup_address || '',
          distance: offer.distance || '',
          fee: offer.fee || '',
          customer_name: offer.customer_name || '',
          service_name: offer.service_name || 'TEMBUS On Demand',
          service_code: offer.service_code || '',
          vehicle_type: offer.vehicle_type || '',
          route_profile: offer.route_profile || '',
          route_provider: offer.route_provider || '',
          route_distance_meters: offer.route_distance_meters || 0,
          route_duration_seconds: offer.route_duration_seconds || 0,
          eta_minutes: offer.eta_minutes || 0,
          route_snapshot_hash: offer.route_snapshot_hash || '',
          route_snapshot_version: offer.route_snapshot_version || null,
          route_version: offer.route_version || '',
          courier_payout_estimate_idr: offer.courier_payout_estimate_idr || Number(offer.fee || 0) || 0,
          expires_at: offer.expires_at,
          offer_ttl_seconds: ON_DEMAND_OFFER_TTL_SECONDS,
        },
      });

      await createNotification({
        user_id: offer.courier_id,
        title: 'Pekerjaan On Demand Baru',
        body: `${offer.service_name || 'On Demand'} tersedia. Terima dalam ${ON_DEMAND_OFFER_TTL_SECONDS} detik.`,
        type: 'on_demand_offer',
        order_id: offer.order_id,
        deep_link: `tembus://orders/${offer.order_id}`,
        metadata: {
          dispatch_id: offer.dispatch_id,
          order_id: offer.order_id,
          pickup_address: offer.pickup_address || '',
          drop_address: 'Alamat tujuan dibuka setelah pekerjaan diterima',
          distance: offer.distance || '',
          fee: offer.fee || '',
          customer_name: offer.customer_name || '',
          service_name: offer.service_name || 'TEMBUS On Demand',
          service_code: offer.service_code || '',
          vehicle_type: offer.vehicle_type || '',
          route_profile: offer.route_profile || '',
          route_provider: offer.route_provider || '',
          route_distance_meters: String(offer.route_distance_meters || 0),
          route_duration_seconds: String(offer.route_duration_seconds || 0),
          eta_minutes: String(offer.eta_minutes || 0),
          route_snapshot_hash: offer.route_snapshot_hash || '',
          route_snapshot_version: String(offer.route_snapshot_version || ''),
          route_version: offer.route_version || '',
          courier_payout_estimate_idr: String(offer.courier_payout_estimate_idr || Number(offer.fee || 0) || 0),
          model: 'p2p',
          workflow_role: 'on_demand',
          offer_expires_at: new Date(offer.expires_at).getTime().toString(),
          offer_ttl_seconds: ON_DEMAND_OFFER_TTL_SECONDS.toString(),
          title: 'Pekerjaan On Demand Baru',
          body: `${offer.service_name || 'On Demand'} tersedia. Terima dalam ${ON_DEMAND_OFFER_TTL_SECONDS} detik.`,
        },
      });
    } catch (error) {
      console.warn('Failed to notify on-demand courier offer:', error);
    }
  }
};



export const getMobileCourierOffers = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const client = await db.connect();
  let createdOffers: CreatedDispatchOffer[] = [];
  try {
    await client.query('BEGIN');
    createdOffers = await advanceOnDemandDispatchQueue(client);

    const result = await client.query(
      `SELECT ${mobileOrderSelect},
         d.id AS dispatch_id,
         (EXTRACT(EPOCH FROM d.expires_at) * 1000)::bigint AS offer_expires_at,
         GREATEST(CEIL(EXTRACT(EPOCH FROM (d.expires_at - NOW()))), 0)::int AS offer_ttl_seconds
       FROM orders o
       JOIN courier_offer_dispatches d ON d.order_id = o.id
         AND d.courier_id = $1
         AND d.status = 'offered'
         AND d.expires_at > NOW()
       LEFT JOIN users c ON c.id = o.customer_id
       LEFT JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
       LEFT JOIN delivery_service_products dsp ON dsp.code = o.service_code
       ORDER BY d.expires_at ASC
       LIMIT 1`,
      [req.user.id]
    );

    await client.query('COMMIT');
    await notifyOnDemandOffers(createdOffers);

    res.json({
      success: true,
      data: result.rows.map(normalizeOfferMobileOrder),
      message: 'Courier on-demand offers loaded',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('Get mobile courier offers error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};



export const acceptMobileCourierOffer = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const { id } = req.params;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    await expireStaleOnDemandOffers(client);

    const dispatchRes = await client.query(
      `SELECT
         d.id AS dispatch_id,
         d.order_id,
         d.courier_id,
          d.status AS dispatch_status,
          d.expires_at,
          d.zone_id,
          d.metadata AS dispatch_metadata,
          o.model,
          o.total_price_idr,
          o.courier_payout_estimate_idr,
          o.platform_commission_idr,
          o.pickup_location,
          COALESCE(NULLIF(o.service_code, ''), o.service_sub_type) AS service_code,
          o.customer_id,
          o.order_number,
          o.merchant_id,
          o.route_snapshot,
          o.route_provider,
          o.route_profile,
          o.route_distance_meters,
          o.route_duration_seconds,
          o.route_polyline,
          o.route_fallback_reason,
          NULLIF(o.route_snapshot->>'vehicle_type', '') AS route_vehicle_type
       FROM courier_offer_dispatches d
       JOIN orders o ON o.id = d.order_id
       WHERE (d.id = $1 OR d.order_id = $1)
         AND d.courier_id = $2
       ORDER BY CASE WHEN d.id = $1 THEN 0 ELSE 1 END, d.created_at DESC
       LIMIT 1
       FOR UPDATE OF d`,
      [id, req.user.id]
    );

    const dispatch = dispatchRes.rows[0];
    if (!dispatch) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, data: null, message: 'Offer not found', code: 'ERR_NOT_FOUND' });
      return;
    }
    const acceptedRouteContract = routeContractFromOrder(dispatch);
    const acceptedRouteMetadata = {
      route_snapshot_hash: acceptedRouteContract.snapshot_hash,
      route_snapshot_version: acceptedRouteContract.snapshot_version,
      route_version: acceptedRouteContract.route_version,
      route_provider: acceptedRouteContract.provider,
      route_profile: acceptedRouteContract.route_profile,
      route_distance_meters: acceptedRouteContract.distance_meters,
      route_duration_seconds: acceptedRouteContract.duration_seconds,
      eta_minutes: acceptedRouteContract.eta_minutes,
      vehicle_type: acceptedRouteContract.vehicle_type,
      service_code: acceptedRouteContract.service_code || dispatch.service_code,
      courier_payout_estimate_idr: Number(dispatch.courier_payout_estimate_idr || 0),
    };

    if (dispatch.dispatch_status !== 'offered' || new Date(dispatch.expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      res.status(409).json({
        success: false,
        data: null,
        message: 'Offer sudah kedaluwarsa. Sistem akan mengalihkan ke kurir berikutnya.',
        code: 'ERR_OFFER_EXPIRED',
      });
      return;
    }

    const courierEligibility = await client.query(
      `WITH active_jobs AS (
         SELECT
           COUNT(*)::int AS active_count,
           BOOL_OR(COALESCE(ol.status, ao.status) IN ('accepted', 'assigned', 'going_to_pickup', 'pickup_pending')) AS has_pickup_job,
           BOOL_OR(COALESCE(ol.status, ao.status) IN ('picked_up', 'in_transit')) AS has_delivery_job,
           BOOL_OR(ao.customer_id IS DISTINCT FROM $5::uuid) AS has_different_customer_job
         FROM order_legs ol
         JOIN orders ao ON ao.id = ol.order_id
         WHERE ol.courier_id = $1
           AND ol.order_id <> $4
           AND COALESCE(ol.status, ao.status) NOT IN ('delivered', 'completed', 'failed', 'cancelled', 'rejected', 'return_required')
       )
       SELECT
         cp.id,
         cp.current_zone_id,
         z.name AS zone_name,
         COALESCE(aj.active_count, 0)::int AS active_count,
         COALESCE(dsp.max_active_orders_on_demand, 1)::int AS max_active_orders_on_demand,
         COALESCE(dsp.allow_new_offer_while_pickup, FALSE) AS allow_new_offer_while_pickup,
         COALESCE(dsp.allow_new_offer_while_delivery, FALSE) AS allow_new_offer_while_delivery,
         COALESCE(dsp.same_customer_batching_required, TRUE) AS same_customer_batching_required,
         COALESCE(aj.has_pickup_job, FALSE) AS has_pickup_job,
         COALESCE(aj.has_delivery_job, FALSE) AS has_delivery_job,
         COALESCE(aj.has_different_customer_job, FALSE) AS has_different_customer_job
       FROM courier_profiles cp
       JOIN zones z ON z.id = cp.current_zone_id AND z.is_active = TRUE
       JOIN courier_service_capabilities csc ON csc.courier_profile_id = cp.id
        AND csc.service_code = $3
        AND csc.application_channel = 'on_demand'
        AND csc.status = 'enabled'
       JOIN delivery_service_products dsp ON dsp.code = csc.service_code
        AND dsp.is_enabled = TRUE
        AND dsp.service_category IN ('on_demand', 'food_delivery', 'tambal_ban', 'towing')
       CROSS JOIN active_jobs aj
       WHERE cp.user_id = $1
         AND cp.application_channel = 'on_demand'
         AND cp.verification_status = 'approved'
         AND cp.is_online = TRUE
         AND cp.current_zone_id = $2
         AND COALESCE(aj.active_count, 0) < COALESCE(dsp.max_active_orders_on_demand, 1)
         AND (
           COALESCE(aj.active_count, 0) = 0
           OR (
             (COALESCE(aj.has_pickup_job, FALSE) = FALSE OR COALESCE(dsp.allow_new_offer_while_pickup, FALSE) = TRUE)
             AND (COALESCE(aj.has_delivery_job, FALSE) = FALSE OR COALESCE(dsp.allow_new_offer_while_delivery, FALSE) = TRUE)
             AND (COALESCE(dsp.same_customer_batching_required, TRUE) = FALSE OR COALESCE(aj.has_different_customer_job, FALSE) = FALSE)
           )
         )
       LIMIT 1`,
      [req.user.id, dispatch.zone_id, dispatch.service_code, dispatch.order_id, dispatch.customer_id]
    );

    if (courierEligibility.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(403).json({
        success: false,
        data: null,
        message: 'Kurir harus On Duty di zona aktif yang sama untuk menerima pekerjaan on-demand.',
        code: 'ERR_COURIER_NOT_ELIGIBLE',
      });
      return;
    }

    await client.query(
      `SELECT id
       FROM orders
       WHERE id = $1
         AND LOWER(model) IN ('p2p', 'on_demand', 'ondemand')
         AND status NOT IN ('cancelled', 'delivered', 'failed')
       FOR UPDATE`,
      [dispatch.order_id]
    );

    const existingLeg = await client.query(
      `SELECT id, courier_id, status
       FROM order_legs
       WHERE order_id = $1 AND leg_number = 1
       FOR UPDATE`,
      [dispatch.order_id]
    );

    const leg = existingLeg.rows[0];
    if (leg?.courier_id && leg.courier_id !== req.user.id) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, data: null, message: 'Offer already taken', code: 'ERR_OFFER_TAKEN' });
      return;
    }

    if (leg) {
      await client.query(
        `UPDATE order_legs
         SET courier_id = $1, status = 'accepted', assigned_at = COALESCE(assigned_at, NOW()), updated_at = NOW()
         WHERE id = $2`,
        [req.user.id, leg.id]
      );
      await client.query(
        `UPDATE courier_offer_dispatches
         SET order_leg_id = $1
         WHERE id = $2`,
        [leg.id, dispatch.dispatch_id]
      );
    } else {
      const createdLeg = await client.query(
        `INSERT INTO order_legs (order_id, leg_number, courier_id, status, assigned_fee_idr, assigned_at)
         VALUES ($1, 1, $2, 'accepted', $3, NOW())
         ON CONFLICT (order_id, leg_number) DO UPDATE
           SET courier_id = EXCLUDED.courier_id,
               status = 'accepted',
               assigned_fee_idr = EXCLUDED.assigned_fee_idr,
               assigned_at = COALESCE(order_legs.assigned_at, NOW()),
               updated_at = NOW()
         RETURNING id`,
        [
          dispatch.order_id,
          req.user.id,
          dispatch.courier_payout_estimate_idr ||
            Math.max((dispatch.total_price_idr || 0) - (dispatch.platform_commission_idr || 0), 0)
        ]
      );
      await client.query(
        `UPDATE courier_offer_dispatches
         SET order_leg_id = $1
         WHERE id = $2`,
        [createdLeg.rows[0].id, dispatch.dispatch_id]
      );
    }

    await client.query(
      `UPDATE courier_offer_dispatches
       SET status = 'accepted',
           responded_at = NOW(),
           response_reason = 'accepted_by_courier',
           updated_at = NOW()
       WHERE id = $1`,
      [dispatch.dispatch_id]
    );
    await client.query(
      `UPDATE courier_offer_dispatches
       SET status = 'lost',
           responded_at = COALESCE(responded_at, NOW()),
           response_reason = 'accepted_by_another_courier',
           updated_at = NOW()
       WHERE order_id = $1
         AND id <> $2
         AND status = 'offered'`,
      [dispatch.order_id, dispatch.dispatch_id]
    );

    await client.query(`UPDATE orders SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [dispatch.order_id]);
    await client.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
       VALUES ($1, $2, 'offer_accepted', 'Courier accepted on-demand offer', $3)`,
      [dispatch.order_id, req.user.id, JSON.stringify({
        source: 'courier_app',
        dispatch_id: dispatch.dispatch_id,
        ...acceptedRouteMetadata,
      })]
    );

    const accepted = await client.query(
      `SELECT ${mobileOrderSelect},
         NULL::uuid AS dispatch_id,
         NULL::bigint AS offer_expires_at,
         NULL::int AS offer_ttl_seconds
       FROM orders o
       JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
       LEFT JOIN users c ON c.id = o.customer_id
       LEFT JOIN delivery_service_products dsp ON dsp.code = o.service_code
       WHERE o.id = $1`,
      [dispatch.order_id]
    );

    await client.query('COMMIT');
    emitOnDemandRealtime(ON_DEMAND_REALTIME_EVENTS.OFFER_ACCEPTED, {
      order_id: dispatch.order_id,
      order_number: dispatch.order_number || null,
      customer_id: dispatch.customer_id,
      courier_user_id: req.user.id,
      merchant_id: dispatch.merchant_id || null,
      admin_broadcast: true,
      status: 'accepted',
      stage: 'courier_otw_pickup',
      metadata: {
        dispatch_id: dispatch.dispatch_id,
        ...acceptedRouteMetadata,
      },
    });
    emitOnDemandRealtime(ON_DEMAND_REALTIME_EVENTS.COURIER_OTW_PICKUP, {
      order_id: dispatch.order_id,
      order_number: dispatch.order_number || null,
      customer_id: dispatch.customer_id,
      courier_user_id: req.user.id,
      merchant_id: dispatch.merchant_id || null,
      admin_broadcast: true,
      status: 'accepted',
      stage: 'courier_otw_pickup',
      metadata: {
        dispatch_id: dispatch.dispatch_id,
        ...acceptedRouteMetadata,
      },
    });
    if (dispatch.customer_id) {
      try {
        await createNotification({
          user_id: dispatch.customer_id,
          title: 'Kurir sudah menerima order',
          body: 'Kurir sedang menuju titik pickup. Lokasi dapat dipantau dari detail order.',
          type: 'courier_assigned',
          order_id: dispatch.order_id,
          deep_link: `/orders/${dispatch.order_id}`,
          metadata: {
            order_number: dispatch.order_number || '',
            courier_id: req.user.id,
            dispatch_id: dispatch.dispatch_id,
            route_snapshot_hash: acceptedRouteMetadata.route_snapshot_hash || '',
            route_provider: acceptedRouteMetadata.route_provider || '',
          },
        });
      } catch (notificationError) {
        console.warn('Failed to notify customer about accepted offer:', notificationError);
      }
    }
    void evaluateOnDemandRealtimeAlerts(db);
    res.json({ success: true, data: normalizeMobileOrder(accepted.rows[0]), message: 'Offer accepted' });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('Accept mobile courier offer error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};



export const rejectMobileCourierOffer = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const { id } = req.params;
  const reason = req.body?.reason || 'courier_rejected';
  const client = await db.connect();
  let createdOffers: CreatedDispatchOffer[] = [];

  try {
    await client.query('BEGIN');
    createdOffers = await expireStaleOnDemandOffers(client);

    const rejected = await client.query(
      `UPDATE courier_offer_dispatches d
       SET status = 'rejected',
           responded_at = NOW(),
           response_reason = $3,
           updated_at = NOW()
       WHERE (d.id = $1 OR d.order_id = $1)
         AND d.courier_id = $2
         AND d.status = 'offered'
       RETURNING d.id, d.order_id`,
      [id, req.user.id, reason]
    );

    const dispatch = rejected.rows[0];
    if (!dispatch) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, data: null, message: 'Offer not found', code: 'ERR_NOT_FOUND' });
      return;
    }

    await client.query(
      `INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
       VALUES ($1, $2, 'offer_rejected', 'Courier rejected on-demand offer', $3)`,
      [dispatch.order_id, req.user.id, JSON.stringify({ reason, source: 'courier_app', dispatch_id: dispatch.id })]
    );

    const nextOffer = await dispatchNextOnDemandCourier(client, dispatch.order_id);
    if (nextOffer) createdOffers.push(nextOffer);

    await client.query('COMMIT');
    await notifyOnDemandOffers(createdOffers);

    res.json({ success: true, data: true, message: 'Offer rejected' });
  } catch (error) {
    await client.query('ROLLBACK');
    securityLog.error('Reject mobile courier offer error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  } finally {
    client.release();
  }
};


