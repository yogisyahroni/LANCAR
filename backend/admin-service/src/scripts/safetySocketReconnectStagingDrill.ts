import crypto from 'crypto';
import path from 'path';

import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

type StagingOrder = { id: string; orderNumber: string };

const apiBaseUrl = (process.env.SAFETY_STAGING_API_BASE_URL || 'https://api.bawain.my.id').replace(/\/$/, '');
const databaseUrl = process.env.SAFETY_STAGING_DATABASE_URL || process.env.DATABASE_URL;
const customerEmail = process.env.SAFETY_STAGING_CUSTOMER_EMAIL || 'customer@tembus.id';
const jwtSecret = String(process.env.JWT_SECRET || '').trim();
const jwtIssuer = process.env.JWT_ISSUER || 'tembus-auth-service';
const customerOrigin = 'https://app.bawain.my.id';

if (process.env.SAFETY_STAGING_DRILL_CONFIRM !== 'true') {
  throw new Error('Set SAFETY_STAGING_DRILL_CONFIRM=true for a staging-only reconnect drill');
}
if (!databaseUrl) throw new Error('SAFETY_STAGING_DATABASE_URL or DATABASE_URL is required');
if (!jwtSecret) throw new Error('JWT_SECRET from the staging secret environment is required');

const pool = new Pool({ connectionString: databaseUrl, max: 2 });
const runId = Date.now().toString(36);
const orderNumber = `SAFE-R-${runId}`;

const issueCustomerToken = (userId: string) => jwt.sign(
  { user_id: userId, role: 'customer' },
  jwtSecret,
  { issuer: jwtIssuer, expiresIn: '10m' },
);

const customerHeaders = (token: string, idempotencyKey?: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Origin: customerOrigin,
  Referer: `${customerOrigin}/orders`,
  'X-Portal': 'customer',
  'User-Agent': 'TEMBUS-staging-reconnect-drill/1.0',
  ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
});

const createTemporaryOrder = async (customerId: string): Promise<StagingOrder> => {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO orders (
       order_number, customer_id, model, status, pickup_location, pickup_address,
       dropoff_location, dropoff_address, base_price_idr, total_price_idr, ppn_idr, mdr_idr,
       courier_payout_estimate_idr, platform_commission_idr, service_code, service_category,
       service_sub_type, order_type, handover_token, route_snapshot, service_metadata
     ) VALUES (
       $1, $2, 'on_demand', 'paid',
       ST_SetSRID(ST_MakePoint(106.84, -6.18), 4326)::geography, 'Reconnect Drill Pickup',
       ST_SetSRID(ST_MakePoint(106.8401, -6.1801), 4326)::geography, 'Reconnect Drill Dropoff',
       100000, 100000, 0, 0, 80000, 20000, 'towing', 'towing', 'towing_mobil', 'ondemand',
       $3, $4::jsonb, $5::jsonb
     ) RETURNING id`,
    [
      orderNumber,
      customerId,
      `SAFETY-RECONNECT-${crypto.randomUUID()}`,
      JSON.stringify({ version: '2026-09-14', provider: 'local', profile: 'driving' }),
      JSON.stringify({ market_code: 'id-jk', source: 'safety_socket_reconnect_staging_drill' }),
    ],
  );
  const order = result.rows[0];
  if (!order?.id) throw new Error('Temporary reconnect drill order was not created');
  return { id: order.id, orderNumber };
};

const apiJson = async (
  token: string,
  orderId: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
) => {
  const route = method === 'POST' ? 'safety-incidents' : 'safety-center';
  const response = await fetch(`${apiBaseUrl}/api/v1/customer/orders/${orderId}/${route}`, {
    method,
    headers: customerHeaders(token, method === 'POST' ? `safety-reconnect-${runId}` : undefined),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { response, data: data as Record<string, unknown> };
};

const socketHeaders = (sessionToken: string): Record<string, string> => ({
  Accept: '*/*',
  Origin: customerOrigin,
  Referer: `${customerOrigin}/`,
  Cookie: `customer_session=${sessionToken}`,
  'User-Agent': 'TEMBUS-staging-reconnect-drill/1.0',
});

const socketPollingUrl = (sid?: string) => {
  const query = new URLSearchParams({ EIO: '4', transport: 'polling', t: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
  if (sid) query.set('sid', sid);
  return `${apiBaseUrl}/socket.io/?${query.toString()}`;
};

const connectSocketPolling = async (sessionToken: string) => {
  const handshake = await fetch(socketPollingUrl(), { headers: socketHeaders(sessionToken) });
  const rawHandshake = await handshake.text();
  if (handshake.status !== 200) throw new Error(`socket handshake failed with HTTP ${handshake.status}`);
  const packet = rawHandshake.match(/^0(\{.*\})/s)?.[1];
  if (!packet) throw new Error('socket handshake did not return an Engine.IO open packet');
  const sid = String((JSON.parse(packet) as { sid?: string }).sid || '').trim();
  if (!sid) throw new Error('socket handshake did not return a session id');

  const namespaceOpen = await fetch(socketPollingUrl(sid), {
    method: 'POST',
    headers: { ...socketHeaders(sessionToken), 'Content-Type': 'text/plain;charset=UTF-8' },
    body: '40',
  });
  if (namespaceOpen.status !== 200) throw new Error(`socket namespace open failed with HTTP ${namespaceOpen.status}`);
  return sid;
};

const simulateNetworkDrop = async (sessionToken: string, sid: string) => {
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), 25);
  try {
    await fetch(socketPollingUrl(sid), { headers: socketHeaders(sessionToken), signal: controller.signal });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'AbortError') throw error;
    return true;
  } finally {
    clearTimeout(abortTimer);
  }
  return false;
};

const closeSocket = async (sessionToken: string, sid: string) => {
  await fetch(socketPollingUrl(sid), {
    method: 'POST',
    headers: { ...socketHeaders(sessionToken), 'Content-Type': 'text/plain;charset=UTF-8' },
    body: '41',
  }).catch(() => undefined);
};

const cleanup = async (order: StagingOrder | undefined) => {
  if (!order) return;
  await pool.query('BEGIN');
  try {
    await pool.query('DELETE FROM notifications WHERE order_id = $1', [order.id]);
    await pool.query('DELETE FROM order_events WHERE order_id = $1', [order.id]);
    await pool.query('DELETE FROM safety_incidents WHERE order_id = $1', [order.id]);
    await pool.query('DELETE FROM order_legs WHERE order_id = $1', [order.id]);
    await pool.query('DELETE FROM orders WHERE id = $1', [order.id]);
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
};

const main = async () => {
  let order: StagingOrder | undefined;
  let firstSocket: { sessionToken: string; sid: string } | undefined;
  let secondSocket: { sessionToken: string; sid: string } | undefined;
  try {
    const identity = await pool.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1',
      [customerEmail],
    );
    const customerId = identity.rows[0]?.id;
    if (!customerId) throw new Error('Configured staging customer identity was not found');

    const sessionResult = await pool.query<{ session_token: string }>(
      `SELECT s.session_token
         FROM web_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE u.id = $1 AND s.expires_at > NOW()
        ORDER BY s.expires_at DESC
        LIMIT 1`,
      [customerId],
    );
    const sessionToken = String(sessionResult.rows[0]?.session_token || '').trim();
    if (!sessionToken) throw new Error('No active staging customer web session found');

    order = await createTemporaryOrder(customerId);
    const token = issueCustomerToken(customerId);
    const incident = await apiJson(token, order.id, 'POST', {
      category: 'emergency_report',
      severity: 'CRITICAL',
      latitude: -6.18,
      longitude: 106.84,
      message: 'Staging socket reconnect drill',
    });
    if (incident.response.status !== 201) throw new Error(`safety incident create failed with HTTP ${incident.response.status}`);

    firstSocket = { sessionToken, sid: await connectSocketPolling(sessionToken) };
    const networkDropSimulated = await simulateNetworkDrop(firstSocket.sessionToken, firstSocket.sid);
    if (!networkDropSimulated) throw new Error('network drop simulation did not abort the polling request');

    secondSocket = { sessionToken, sid: await connectSocketPolling(sessionToken) };
    const snapshot = await apiJson(token, order.id, 'GET');
    const data = snapshot.data.data as { incidents?: unknown[] } | undefined;
    const incidentSurvived = snapshot.response.status === 200 && Array.isArray(data?.incidents) && data.incidents.length > 0;
    if (!incidentSurvived) throw new Error(`safety incident was not present after reconnect; HTTP ${snapshot.response.status}`);

    console.log(JSON.stringify({
      api_base_url: apiBaseUrl,
      socket_transport: 'engine.io polling via gateway /socket.io',
      first_socket_connected: true,
      network_drop_simulated: true,
      second_socket_connected: true,
      safety_snapshot_http: snapshot.response.status,
      safety_incident_survived_reconnect: incidentSurvived,
      cleanup: 'will_run_in_finally',
    }, null, 2));
  } finally {
    if (secondSocket) await closeSocket(secondSocket.sessionToken, secondSocket.sid);
    if (firstSocket) await closeSocket(firstSocket.sessionToken, firstSocket.sid);
    await cleanup(order);
    await pool.end();
  }
};

main().catch((error) => {
  console.error('Safety socket reconnect staging drill failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
