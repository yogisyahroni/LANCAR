import crypto from 'crypto';
import path from 'path';

import axios, { AxiosRequestConfig } from 'axios';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

type StagingOrder = {
  id: string;
  orderNumber: string;
};

type ApiResult = {
  label: string;
  status: number;
  code: string | null;
  escalation: string | null;
  fallback_policy_exposed?: boolean;
  queue_contains_critical_with_sla?: boolean;
};

type StagingRole = 'customer' | 'courier' | 'super_admin';

const API_BASE_URL = String(process.env.SAFETY_STAGING_API_BASE_URL || 'https://api.bawain.my.id').replace(/\/$/, '');
const DATABASE_URL = process.env.SAFETY_STAGING_DATABASE_URL || process.env.TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL;
const CUSTOMER_EMAIL = process.env.SAFETY_STAGING_CUSTOMER_EMAIL || 'customer@tembus.id';
const COURIER_EMAIL = process.env.SAFETY_STAGING_COURIER_EMAIL || 'andri.pratama@tembus.id';
const ADMIN_EMAIL = process.env.SAFETY_STAGING_ADMIN_EMAIL || 'admin@tembus.id';
const JWT_SECRET = String(process.env.JWT_SECRET || '').trim();
const JWT_ISSUER = process.env.JWT_ISSUER || 'tembus-auth-service';

if (process.env.SAFETY_STAGING_DRILL_CONFIRM !== 'true') {
  throw new Error('Safety staging drill requires SAFETY_STAGING_DRILL_CONFIRM=true');
}
if (!DATABASE_URL) throw new Error('Safety staging drill requires SAFETY_STAGING_DATABASE_URL');
if (!JWT_SECRET) throw new Error('Safety staging drill requires JWT_SECRET from the staging secret environment');

const pool = new Pool({ connectionString: DATABASE_URL });

const issueToken = (userId: string, role: StagingRole) => jwt.sign(
  { user_id: userId, role },
  JWT_SECRET,
  { issuer: JWT_ISSUER, expiresIn: '10m' },
);

const callApi = async (
  label: string,
  userId: string,
  role: StagingRole,
  method: 'GET' | 'POST',
  route: string,
  body: Record<string, unknown> | undefined,
  idempotencySuffix?: string,
  expectations?: { orderId?: string; fallbackPolicy?: boolean },
): Promise<ApiResult> => {
  const config: AxiosRequestConfig = {
    baseURL: API_BASE_URL,
    method,
    url: route,
    headers: {
      Authorization: `Bearer ${issueToken(userId, role)}`,
      ...(idempotencySuffix ? { 'Idempotency-Key': `safety-staging-drill-${idempotencySuffix}` } : {}),
    },
    data: body,
    validateStatus: () => true,
    timeout: 20_000,
  };
  const response = await axios.request(config);
  const queueRows = Array.isArray(response.data?.data) ? response.data.data : [];
  const queueContainsCriticalWithSla = expectations?.orderId
    ? queueRows.some((row: any) => row.order_id === expectations.orderId && row.severity === 'CRITICAL' && typeof row.sla_due_at === 'string')
    : undefined;
  const fallbackPolicyExposed = expectations?.fallbackPolicy
    ? response.data?.data?.policy?.sos?.status === 'fallback'
      && response.data?.data?.policy?.sos?.configured === false
    : undefined;
  return {
    label,
    status: response.status,
    code: typeof response.data?.code === 'string' ? response.data.code : null,
    escalation: typeof response.data?.escalation === 'string' ? response.data.escalation : null,
    ...(queueContainsCriticalWithSla !== undefined ? { queue_contains_critical_with_sla: queueContainsCriticalWithSla } : {}),
    ...(fallbackPolicyExposed !== undefined ? { fallback_policy_exposed: fallbackPolicyExposed } : {}),
  };
};

const createTemporaryOrder = async (
  orderNumber: string,
  customerId: string,
  courierId: string,
  serviceCode: string,
  serviceCategory: string,
  serviceSubType: string | null,
): Promise<StagingOrder> => {
  const orderResult = await pool.query<{ id: string }>(
    `INSERT INTO orders (
       order_number, customer_id, model, status, pickup_location, pickup_address,
       dropoff_location, dropoff_address, base_price_idr, total_price_idr, ppn_idr, mdr_idr,
       courier_payout_estimate_idr, platform_commission_idr, service_code, service_category,
       service_sub_type, order_type, handover_token, route_snapshot, service_metadata
     ) VALUES (
       $1, $2, 'on_demand', 'paid',
       ST_SetSRID(ST_MakePoint(106.84, -6.18), 4326)::geography, 'Safety Drill Pickup',
       ST_SetSRID(ST_MakePoint(106.8401, -6.1801), 4326)::geography, 'Safety Drill Dropoff',
       100000, 100000, 0, 0, 80000, 20000, $3, $4, $5, 'ondemand', $6, $7, $8::jsonb
     ) RETURNING id`,
    [
      orderNumber,
      customerId,
      serviceCode,
      serviceCategory,
      serviceSubType,
      `SAFETY-DRILL-${crypto.randomUUID()}`,
      JSON.stringify({ version: '2026-09-14', provider: 'local', profile: 'driving' }),
      JSON.stringify({ market_code: 'id-jk', source: 'safety_staging_drill' }),
    ],
  );
  const order = orderResult.rows[0];
  if (!order?.id) throw new Error(`Failed to create temporary ${serviceCode} order`);

  await pool.query(
    `INSERT INTO order_legs (order_id, leg_number, courier_id, status, assigned_fee_idr, assigned_at)
     VALUES ($1, 1, $2, 'assigned', 80000, NOW())`,
    [order.id, courierId],
  );
  return { id: order.id, orderNumber };
};

const cleanup = async (orders: StagingOrder[]) => {
  const ids = orders.map((order) => order.id).filter(Boolean);
  if (!ids.length) return;
  await pool.query('BEGIN');
  try {
    await pool.query('DELETE FROM notifications WHERE order_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM order_events WHERE order_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM safety_incidents WHERE order_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM order_legs WHERE order_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM orders WHERE id = ANY($1::uuid[])', [ids]);
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
};

const main = async () => {
  const runId = Date.now().toString();
  const orders: StagingOrder[] = [];
  try {
    const identities = await pool.query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE email = ANY($1::text[]) AND deleted_at IS NULL`,
      [[CUSTOMER_EMAIL, COURIER_EMAIL, ADMIN_EMAIL]],
    );
    const customerId = identities.rows.find((row) => row.email === CUSTOMER_EMAIL)?.id;
    const courierId = identities.rows.find((row) => row.email === COURIER_EMAIL)?.id;
    const adminId = identities.rows.find((row) => row.email === ADMIN_EMAIL)?.id;
    if (!customerId || !courierId || !adminId) throw new Error('Configured staging customer/courier/admin identities were not found');

    orders.push(await createTemporaryOrder(`SAFE-DRILL-T-${runId}`, customerId, courierId, 'towing', 'towing', 'towing_mobil'));
    orders.push(await createTemporaryOrder(`SAFE-DRILL-P-${runId}`, customerId, courierId, 'paket', 'package_on_demand', null));

    const results = [
      await callApi('customer towing emergency incident', customerId, 'customer', 'POST', `/api/v1/customer/orders/${orders[0].id}/safety-incidents`, {
        category: 'emergency_report', severity: 'CRITICAL', latitude: -6.18, longitude: 106.84, message: 'Staging safety drill',
      }, `${runId}-customer-incident`),
      await callApi('customer towing safety center read-after-write', customerId, 'customer', 'GET', `/api/v1/customer/orders/${orders[0].id}/safety-center`, undefined, undefined, { fallbackPolicy: true }),
      await callApi('courier paket unsafe-location incident', courierId, 'courier', 'POST', `/api/v1/courier/orders/${orders[1].id}/safety-incidents`, {
        category: 'unsafe_location', severity: 'HIGH', message: 'Staging safety drill',
      }, `${runId}-courier-incident`),
      await callApi('customer towing SOS fallback', customerId, 'customer', 'POST', `/api/v1/customer/orders/${orders[0].id}/sos`, {}, `${runId}-customer-sos`),
      await callApi('Ops queue critical incident with SLA', adminId, 'super_admin', 'GET', '/api/v1/admin/safety/incidents', undefined, undefined, { orderId: orders[0].id }),
    ];
    const unauthorizedEvidence = await callApi(
      'customer denied safety evidence route',
      customerId,
      'customer',
      'GET',
      `/api/v1/admin/safety/incidents/${crypto.randomUUID()}/evidence/${crypto.randomUUID()}`,
      undefined,
    );
    const persisted = await pool.query<{ incident_count: string; critical_count: string }>(
      `SELECT COUNT(*)::text AS incident_count,
              COUNT(*) FILTER (WHERE severity = 'CRITICAL')::text AS critical_count
         FROM safety_incidents WHERE order_id = ANY($1::uuid[])`,
      [orders.map((order) => order.id)],
    );
    const counts = persisted.rows[0];
    console.log(JSON.stringify({
      api_base_url: API_BASE_URL,
      results,
      unauthorized_evidence_status: unauthorizedEvidence.status,
      persisted_incidents: Number(counts?.incident_count || 0),
      persisted_critical_incidents: Number(counts?.critical_count || 0),
      cleanup: 'will_run_in_finally',
    }, null, 2));

    if (results.some((result) => result.status < 200 || result.status >= 300)) {
      throw new Error(`Safety staging drill had an HTTP failure: ${JSON.stringify(results)}`);
    }
    if (unauthorizedEvidence.status !== 403) {
      throw new Error(`Unauthorized safety evidence route expected HTTP 403, got ${unauthorizedEvidence.status}`);
    }
    if (Number(counts?.incident_count || 0) < 3 || Number(counts?.critical_count || 0) < 2) {
      throw new Error(`Safety staging drill persistence assertion failed: ${JSON.stringify(counts)}`);
    }
    const safetyCenter = results.find((result) => result.label === 'customer towing safety center read-after-write');
    const sos = results.find((result) => result.label === 'customer towing SOS fallback');
    const opsQueue = results.find((result) => result.label === 'Ops queue critical incident with SLA');
    if (!safetyCenter?.fallback_policy_exposed || sos?.escalation !== 'fallback_instructions' || !opsQueue?.queue_contains_critical_with_sla) {
      throw new Error(`Safety staging drill policy/queue assertion failed: ${JSON.stringify({ safetyCenter, sos, opsQueue })}`);
    }
  } finally {
    await cleanup(orders);
    await pool.end();
  }
};

main().catch((error) => {
  console.error('Safety staging drill failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
