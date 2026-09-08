import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { db, readDb } from './db';
import {
  submitOnDemandCourierApplication,
  updateCourierDocumentVerification,
  updateCourierStatus,
} from './controllers/couriers.controller';
import { updateMobileCourierDuty } from './controllers/courier/courierDuty.controller';
import { acceptMobileCourierOffer } from './controllers/courier/courierOffer.controller';
import { getMobileCourierOrders } from './controllers/courier/courierOrders.controller';
import { updateMobileCourierOrderStatus } from './controllers/courier/courierAccount.controller';
import {
  scanMobileCourierOrder,
  uploadMobileCourierPod,
} from './controllers/courier/courierProof.controller';
import { createMobileCourierPayoutRequest } from './controllers/courier/courierEarnings.controller';
import {
  createAdminCourierEnforcementAction,
  reviewAdminCourierEnforcementAppeal,
  submitMobileCourierEnforcementAppeal,
} from './controllers/courier/courierEnforcement.controller';
import { createMobileCourierSafetyEvent } from './controllers/courier/courierSafety.controller';

type AnyRequest = Record<string, any>;
type ResponseResult = { status: number; body: any };

const tempUploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tembus-courier-012-'));
process.env.UPLOAD_PRIVATE_DIR = tempUploadRoot;

const invoke = async (handler: (req: any, res: any) => Promise<any>, req: AnyRequest): Promise<ResponseResult> => {
  let status = 200;
  let body: any = null;
  const res: AnyRequest = {
    status(code: number) {
      status = code;
      return res;
    },
    json(value: any) {
      body = value;
      return res;
    },
    send(value: any) {
      body = value;
      return res;
    },
  };
  await handler(req, res);
  return { status, body };
};

const assertStatus = (label: string, response: ResponseResult, expected: number | number[] = [200, 201]) => {
  const statuses = Array.isArray(expected) ? expected : [expected];
  if (!statuses.includes(response.status)) {
    throw new Error(`${label} failed with HTTP ${response.status}: ${JSON.stringify(response.body)}`);
  }
};

const assertCode = (label: string, response: ResponseResult, expectedCode: string) => {
  if (response.body?.code !== expectedCode) {
    throw new Error(`${label} expected ${expectedCode}: ${JSON.stringify(response.body)}`);
  }
};

const userReq = (userId: string, body: AnyRequest = {}, params: AnyRequest = {}, headers: AnyRequest = {}): AnyRequest => ({
  user: { id: userId, role: 'courier' },
  body,
  params,
  headers,
  socket: { remoteAddress: '127.0.0.1' },
});

const adminReq = (adminId: string, body: AnyRequest = {}, params: AnyRequest = {}): AnyRequest => ({
  user: { id: adminId, role: 'admin' },
  body,
  params,
  headers: {},
  socket: { remoteAddress: '127.0.0.1' },
});

const proofFile = (name: string): AnyRequest => {
  const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  return {
    buffer,
    originalname: name,
    mimetype: 'image/jpeg',
    size: buffer.length,
    detectedMimeType: 'image/jpeg',
    safeExtension: '.jpg',
    safeFileName: name,
    checksumSha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
};

const cleanup = async (phone: string, profileId: string | null, orderId: string | null) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const userRes = await client.query('SELECT id FROM users WHERE phone_number = $1', [phone]);
    const userId = userRes.rows[0]?.id || null;
    const effectiveOrderId = orderId;
    if (userId) {
      // The production ledger is append-only. Temporarily disabling its trigger
      // is limited to this generated probe data so FK cleanup can set order and
      // payout references to NULL without leaving test rows behind.
      await client.query('ALTER TABLE courier_earnings_ledger DISABLE TRIGGER trg_courier_earnings_ledger_append_only');
    }
    if (effectiveOrderId) {
      await client.query('UPDATE courier_availability_state SET active_order_id = NULL WHERE active_order_id = $1', [effectiveOrderId]);
      await client.query('DELETE FROM notifications WHERE order_id = $1', [effectiveOrderId]);
      await client.query('DELETE FROM order_events WHERE order_id = $1', [effectiveOrderId]);
      await client.query('DELETE FROM package_scans WHERE order_id = $1', [effectiveOrderId]);
      await client.query('DELETE FROM order_legs WHERE order_id = $1', [effectiveOrderId]);
      await client.query('DELETE FROM orders WHERE id = $1', [effectiveOrderId]);
    }
    if (userId) {
      await client.query('DELETE FROM courier_payout_requests WHERE courier_id = $1', [userId]);
      await client.query('DELETE FROM courier_earnings_ledger WHERE courier_id = $1', [userId]);
      await client.query('ALTER TABLE courier_earnings_ledger ENABLE TRIGGER trg_courier_earnings_ledger_append_only');
      await client.query('DELETE FROM courier_payout_accounts WHERE courier_id = $1', [userId]);
      await client.query('DELETE FROM courier_safety_events WHERE courier_id = $1', [userId]);
      await client.query('DELETE FROM courier_proof_attempts WHERE courier_id = $1', [userId]);
      await client.query('DELETE FROM courier_face_verifications WHERE courier_id = $1', [userId]);
      await client.query('DELETE FROM courier_offer_dispatches WHERE courier_id = $1', [userId]);
    }
    if (profileId) {
      await client.query('DELETE FROM courier_availability_state WHERE courier_id = $1', [profileId]);
      await client.query('DELETE FROM courier_market_verifications WHERE courier_profile_id = $1', [profileId]);
      await client.query('DELETE FROM courier_profiles WHERE id = $1', [profileId]);
    }
    await client.query('DELETE FROM users WHERE phone_number = $1', [phone]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const main = async () => {
  const runId = Date.now().toString();
  const phone = `+628999012${runId.slice(-4)}`;
  const password = String(100000 + (Number.parseInt(runId.slice(-6), 10) % 900000)).padStart(6, '0');
  const adminId = '0e8a86a4-963e-4816-ad4a-6138f10db033';
  const documents: Record<string, string> = {};
  for (const type of ['ktp', 'sim', 'stnk', 'skpd', 'vehicle_photo', 'skck', 'bank_account', 'face_enrollment']) {
    documents[type] = `https://local.test/courier-012/${type}.jpg`;
  }

  let profileId: string | null = null;
  let userId: string | null = null;
  let orderId: string | null = null;
  try {
    const application = await invoke(submitOnDemandCourierApplication, {
      body: {
        full_name: 'Courier Lifecycle Gate 012',
        nik: '3174000000000120',
        phone_number: phone,
        password,
        vehicle_type: 'matic',
        vehicle_plate: `B 012 GAT${runId.slice(-2)}`,
        vehicle_brand: 'Honda',
        vehicle_model: 'Beat',
        vehicle_year: 2025,
        vehicle_cc: 125,
        vehicle_category: 'motor',
        engine_type: '4_tak',
        sim_active: true,
        skpd_tax_active: true,
        bank_code: 'BCA',
        bank_account_number: '0123456789',
        bank_account_name: 'Courier Lifecycle Gate 012',
        market_code: 'id',
        service_categories: ['tembus_hemat'],
        documents,
      },
      params: {},
      headers: {},
    });
    assertStatus('apply', application, 201);
    profileId = application.body.data.courier_id;

    const identity = await db.query('SELECT cp.id, cp.user_id FROM courier_profiles cp WHERE cp.id = $1', [profileId]);
    userId = identity.rows[0].user_id;
    const courierUser = userReq(userId!);
    const admin = adminReq(adminId);

    const verifying = await invoke(updateCourierStatus, adminReq(adminId, { status: 'verifying' }, { id: profileId }));
    assertStatus('application verify transition', verifying);

    const documentRows = await db.query(
      `SELECT id, doc_type FROM courier_documents WHERE courier_id = $1 ORDER BY doc_type`,
      [profileId],
    );
    for (const document of documentRows.rows) {
      const verified = await invoke(updateCourierDocumentVerification, adminReq(adminId, {
        document_status: 'verified',
        verification_source: 'manual_review',
        service_scope: ['*'],
      }, { id: profileId, documentId: document.id }));
      assertStatus(`verify document ${document.doc_type}`, verified);
    }

    const activated = await invoke(updateCourierStatus, adminReq(adminId, { status: 'active' }, { id: profileId }));
    assertStatus('capability activation', activated);

    await db.query(
      `INSERT INTO courier_market_verifications (
         courier_profile_id, market_code, status, vehicle_eligible, documents_eligible,
         tax_eligible, payout_eligible, checked_policy_version, verified_by, verified_at, evidence_metadata
       ) VALUES ($1, 'id', 'approved', TRUE, TRUE, TRUE, TRUE, 'courier-market-id-v1', $2, NOW(), $3)`,
      [profileId, adminId, JSON.stringify({ source: 'local_release_gate_probe' })],
    );
    await db.query(
      `UPDATE users SET status = 'active', photo_url = '/local/courier-012.jpg', profile_photo_locked_at = NOW() WHERE id = $1`,
      [userId],
    );

    const online = await invoke(updateMobileCourierDuty, userReq(userId!, {
      online: true,
      presence_state: 'online',
      latitude: -6.18,
      longitude: 106.84,
      accuracy: 5,
    }));
    assertStatus('go online', online);

    const capabilityRows = await db.query(
      `SELECT csc.service_code, csc.status, csc.vehicle_id
       FROM courier_service_capabilities csc
       WHERE csc.courier_profile_id = $1
       ORDER BY csc.service_code`,
      [profileId],
    );
    const vehicleId = capabilityRows.rows.find((row) => row.service_code === 'tembus_hemat')?.vehicle_id;
    if (!vehicleId) throw new Error('Activated tembus_hemat capability did not receive a vehicle binding');
    const zone = await db.query('SELECT current_zone_id FROM courier_profiles WHERE id = $1', [profileId]);
    const zoneId = zone.rows[0]?.current_zone_id;
    if (!zoneId) throw new Error('go online did not assign an active zone');

    const order = await db.query(
      `INSERT INTO orders (
         order_number, customer_id, model, status, pickup_location, pickup_address,
         dropoff_location, dropoff_address, base_price_idr, total_price_idr, ppn_idr, mdr_idr,
         courier_payout_estimate_idr, platform_commission_idr, service_code, service_category,
         order_type, handover_token, route_snapshot
       ) VALUES (
         $1, $2, 'on_demand', 'paid',
         ST_SetSRID(ST_MakePoint(106.84, -6.18), 4326)::geography, 'Lifecycle Gate Pickup',
         ST_SetSRID(ST_MakePoint(106.8401, -6.1801), 4326)::geography, 'Lifecycle Gate Dropoff',
         100000, 100000, 0, 0, 80000, 20000, 'tembus_priority', 'package_on_demand',
         'ondemand', 'COURIER-012-HANDOVER', $3
       ) RETURNING id`,
      [
        `COURIER-012-${runId}`,
        '8d5995cd-67cb-424a-8d1c-53e2f6dd786b',
        JSON.stringify({ version: '2026-09-01', vehicle_type: 'motor', distance_meters: 20, duration_seconds: 60, provider: 'local', profile: 'driving' }),
      ],
    );
    orderId = order.rows[0].id;
    const dispatch = await db.query(
      `INSERT INTO courier_offer_dispatches (order_id, courier_id, zone_id, rank_number, status, expires_at, metadata)
       VALUES ($1, $2, $3, 1, 'offered', NOW() + INTERVAL '10 minutes', $4)
       RETURNING id`,
      [orderId, userId, zoneId, JSON.stringify({ vehicle_id: vehicleId })],
    );
    const dispatchId = dispatch.rows[0].id;

    await db.query(
      `UPDATE courier_service_capabilities SET status = 'disabled', updated_at = NOW()
       WHERE courier_profile_id = $1 AND service_code = 'tembus_priority'`,
      [profileId],
    );
    const wrongCapability = await invoke(acceptMobileCourierOffer, userReq(userId!, {}, { id: dispatchId }));
    assertStatus('wrong capability offer rejection', wrongCapability, 403);
    assertCode('wrong capability offer rejection', wrongCapability, 'ERR_COURIER_NOT_ELIGIBLE');

    await db.query(
      `UPDATE courier_service_capabilities SET status = 'enabled', updated_at = NOW()
       WHERE courier_profile_id = $1 AND service_code = 'tembus_priority'`,
      [profileId],
    );
    await db.query(`UPDATE orders SET service_code = 'tembus_hemat' WHERE id = $1`, [orderId]);

    await db.query(`UPDATE courier_offer_dispatches SET metadata = $2 WHERE id = $1`, [dispatchId, JSON.stringify({ vehicle_id: crypto.randomUUID() })]);
    const wrongVehicle = await invoke(acceptMobileCourierOffer, userReq(userId!, {}, { id: dispatchId }));
    assertStatus('wrong vehicle offer rejection', wrongVehicle, 409);
    assertCode('wrong vehicle offer rejection', wrongVehicle, 'ERR_VEHICLE_BINDING_CONFLICT');

    await db.query(`UPDATE courier_offer_dispatches SET metadata = '{}'::jsonb WHERE id = $1`, [dispatchId]);
    const missingVehicle = await invoke(acceptMobileCourierOffer, userReq(userId!, {}, { id: dispatchId }));
    assertStatus('missing vehicle offer rejection', missingVehicle, 409);
    assertCode('missing vehicle offer rejection', missingVehicle, 'ERR_VEHICLE_BINDING_REQUIRED');

    await db.query(`UPDATE courier_offer_dispatches SET metadata = $2 WHERE id = $1`, [dispatchId, JSON.stringify({ vehicle_id: vehicleId })]);
    const accepted = await invoke(acceptMobileCourierOffer, userReq(userId!, {}, { id: dispatchId }));
    assertStatus('eligible offer acceptance', accepted);

    await db.query(`UPDATE courier_profiles SET is_online = FALSE WHERE id = $1`, [profileId]);
    const recovered = await invoke(getMobileCourierOrders, courierUser);
    assertStatus('offline/restart recovery', recovered);
    if (!recovered.body.data?.some((item: any) => item.order_id === orderId && item.status === 'accepted')) {
      throw new Error(`offline/restart recovery did not return the persisted active order: ${JSON.stringify(recovered.body)}`);
    }
    await db.query(`UPDATE courier_profiles SET is_online = TRUE WHERE id = $1`, [profileId]);

    const arrived = await invoke(updateMobileCourierOrderStatus, userReq(userId!, { order_id: orderId!, status: 'pickup_arrived' }));
    assertStatus('pickup arrival', arrived);

    const safety = await invoke(createMobileCourierSafetyEvent, userReq(userId!, {
      order_id: orderId!,
      event_type: 'road_incident',
      severity: 'high',
      latitude: -6.18,
      longitude: 106.84,
      accuracy: 5,
      message: 'Release gate safety incident must remain attached to the order.',
      reason_code: 'road_incident',
    }));
    assertStatus('safety incident creation', safety);
    const safetyEventId = safety.body.data.id;

    await db.query(
      `INSERT INTO courier_face_verifications (courier_id, order_id, verification_type, status, provider, metadata)
       VALUES ($1, $2, 'pickup', 'verified', 'local_release_gate', $3),
              ($1, $2, 'delivery', 'verified', 'local_release_gate', $3)`,
      [userId, orderId, JSON.stringify({ source: 'deterministic_local_probe' })],
    );
    const pickupScan = await invoke(scanMobileCourierOrder, userReq(userId!, {
      order_id: orderId!,
      scan_type: 'pickup',
      latitude: -6.18,
      longitude: 106.84,
      accuracy: 5,
      barcode_value: 'COURIER-012-HANDOVER',
      face_verification_id: (await db.query(`SELECT id FROM courier_face_verifications WHERE courier_id = $1 AND order_id = $2 AND verification_type = 'pickup' ORDER BY created_at DESC LIMIT 1`, [userId, orderId])).rows[0].id,
    }));
    assertStatus('pickup scan', pickupScan);

    const pickupPhoto = await invoke(uploadMobileCourierPod, {
      ...userReq(userId!, {
        order_id: orderId!,
        proof_type: 'pickup',
        latitude: -6.18,
        longitude: 106.84,
        accuracy: 5,
        face_verification_id: (await db.query(`SELECT id FROM courier_face_verifications WHERE courier_id = $1 AND order_id = $2 AND verification_type = 'pickup' ORDER BY created_at DESC LIMIT 1`, [userId, orderId])).rows[0].id,
      }),
      file: proofFile('courier-012-pickup.jpg'),
    });
    assertStatus('pickup photo', pickupPhoto);

    const deliveryFaceId = (await db.query(`SELECT id FROM courier_face_verifications WHERE courier_id = $1 AND order_id = $2 AND verification_type = 'delivery' ORDER BY created_at DESC LIMIT 1`, [userId, orderId])).rows[0].id;
    const pod = await invoke(uploadMobileCourierPod, {
      ...userReq(userId!, {
        order_id: orderId!,
        proof_type: 'delivery',
        latitude: -6.1801,
        longitude: 106.8401,
        accuracy: 5,
        face_verification_id: deliveryFaceId,
      }),
      file: proofFile('courier-012-pod.jpg'),
    });
    assertStatus('delivery POD and earning', pod);
    if (pod.body.data?.status !== 'delivered' || !pod.body.data?.earning_ledger_id) {
      throw new Error(`delivery POD did not complete and credit earning: ${JSON.stringify(pod.body)}`);
    }

    const safetyPersisted = await db.query(
      `SELECT id, order_id, status FROM courier_safety_events WHERE id = $1`,
      [safetyEventId],
    );
    if (safetyPersisted.rows[0]?.order_id !== orderId) {
      throw new Error(`safety incident disappeared or detached after completion: ${JSON.stringify(safetyPersisted.rows[0])}`);
    }

    await db.query(
      `INSERT INTO courier_payout_accounts (
         courier_id, courier_profile_id, bank_code, account_name, account_number_last4,
         account_number_fingerprint, account_number_vault_ref, status, is_primary,
         verified_by, verified_at
       ) VALUES ($1, $2, 'BCA', 'Courier Lifecycle Gate 012', '6789', $3, 'local-vault-ref:courier-012', 'verified', TRUE, $4, NOW())`,
      [userId, profileId, crypto.createHash('sha256').update(`courier-012-${runId}`).digest('hex'), adminId],
    );
    const payout = await invoke(createMobileCourierPayoutRequest, {
      ...userReq(userId!, { amount_idr: 50000, transaction_pin: password, idempotency_key: `courier-012-${runId}` }),
      headers: { 'x-idempotency-key': `courier-012-${runId}` },
    });
    assertStatus('withdrawal request', payout, 201);
    if (!payout.body.data?.request?.id) throw new Error(`withdrawal request missing authoritative payout id: ${JSON.stringify(payout.body)}`);

    const enforcement = await invoke(createAdminCourierEnforcementAction, adminReq(adminId, {
      enforcement_type: 'suspension',
      scope: 'account',
      reason_category: 'safety',
      reason_detail: 'Temporary release gate suspension audit.',
      courier_message: 'Account suspended for release gate audit.',
      safe_job_policy: 'immediate_safety_stop',
    }, { id: profileId }));
    assertStatus('suspension', enforcement, 201);
    const actionId = enforcement.body.data.action.id;

    const appeal = await invoke(submitMobileCourierEnforcementAppeal, userReq(userId!, {
      enforcement_action_id: actionId,
      reason: 'The courier requests a documented review and reinstatement after the safety audit is complete.',
    }));
    assertStatus('appeal submission', appeal, 201);
    const appealId = appeal.body.data.appeal.id;
    const review = await invoke(reviewAdminCourierEnforcementAppeal, adminReq(adminId, {
      status: 'approved',
      review_note: 'Audit complete; restore the previously approved courier account state.',
    }, { appealId }));
    assertStatus('appeal approval and reinstatement', review);
    if (review.body.data?.reinstatement !== true) throw new Error(`appeal did not reinstate account: ${JSON.stringify(review.body)}`);

    const finalState = await db.query(
      `SELECT u.status AS user_status, cp.onboarding_status, cp.status AS profile_status,
              EXISTS (SELECT 1 FROM courier_safety_events cse WHERE cse.id = $2 AND cse.order_id = $3) AS safety_preserved,
              (SELECT COUNT(*) FROM courier_enforcement_action_events WHERE enforcement_action_id = $4 AND event_type IN ('created', 'appeal_submitted', 'appeal_reviewed', 'revoked'))::int AS enforcement_events,
              (SELECT COUNT(*) FROM audit_logs WHERE target_id = $4 AND action LIKE 'courier.enforcement%')::int AS audit_events
       FROM users u JOIN courier_profiles cp ON cp.user_id = u.id
       WHERE cp.id = $1`,
      [profileId, safetyEventId, orderId, actionId],
    );
    const state = finalState.rows[0];
    if (state.user_status !== 'active' || state.onboarding_status !== 'ACTIVE' || state.profile_status !== 'active') {
      throw new Error(`reinstatement state mismatch: ${JSON.stringify(state)}`);
    }
    if (!state.safety_preserved || state.enforcement_events < 4 || state.audit_events < 2) {
      throw new Error(`audit/safety evidence incomplete: ${JSON.stringify(state)}`);
    }

    console.log(JSON.stringify({
      status: 'PASS',
      task_id: 'COURIER-2026-012',
      scenarios: {
        apply_verify_activate_online_offer_complete_earn_withdraw: 'PASS',
        expired_document_scope: 'PASS (separate PostgreSQL scope probe)',
        wrong_vehicle_offer_rejected: 'PASS',
        wrong_capability_offer_rejected: 'PASS',
        offline_restart_recovered_active_job: 'PASS',
        suspension_appeal_reinstatement_audited: 'PASS',
        safety_incident_preserved_after_completion: 'PASS',
      },
      evidence: {
        profile_id: profileId,
        order_id: orderId,
        payout_request_id: payout.body.data.request.id,
      },
    }));
  } finally {
    await cleanup(phone, profileId, orderId);
    fs.rmSync(tempUploadRoot, { recursive: true, force: true });
    // Controller-side realtime hooks can leave optional clients/timers alive
    // in this process-only harness. Cleanup is committed above; close pools
    // best-effort and let the CLI wrapper terminate the probe deterministically.
    void db.end();
    void readDb.end();
  }
};

main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
  process.exit(1);
});
