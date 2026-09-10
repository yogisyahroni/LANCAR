import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DEFAULT_API_URL = 'https://api.tembus.id/api/v1';
const DEFAULT_SERVICE_CODE = 'tembus_instant';
const DEFAULT_ALT_SERVICE_CODE = 'tembus_hemat';
const DEFAULT_DEVICE_ID = 'gha-core-part-a-20260910';
const MUTATION_CONFIRMATION = 'I_UNDERSTAND_STAGING_TEST_ORDERS';
const CONCURRENT_ATTEMPTS = 10;

const PRICE_FIELDS = [
  'service_code',
  'currency',
  'currency_minor_unit',
  'input_fingerprint',
  'pricing_rule_version',
  'distance_km',
  'base_price_idr',
  'volumetric_surcharge_idr',
  'insurance_premium_idr',
  'dynamic_price_idr',
  'platform_fee_idr',
  'material_cost_idr',
  'toll_cost_idr',
  'eta_minutes',
  'total_price_idr',
];

class GateError extends Error {
  constructor(message, code = 'STAGING_CORE_GATE_FAILED', status = null) {
    super(message);
    this.name = 'GateError';
    this.code = code;
    this.status = status;
  }
}

export const normalizeApiBase = (value) => {
  const configured = String(value || DEFAULT_API_URL).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(configured)) {
    throw new GateError('STAGING_CORE_GATE_API_URL must be an http(s) URL', 'GATE_API_URL_INVALID');
  }
  return /\/api\/v1$/i.test(configured) ? configured : `${configured}/api/v1`;
};

const finiteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const responseCode = (body) => String(body?.code || body?.error_code || '').trim();

const isReplayedResponse = (result) =>
  String(result?.headers?.get?.('x-idempotency-replayed') || '').toLowerCase() === 'true';

const quoteBody = (body) => {
  if (body?.quote_id || body?.input_fingerprint) return body;
  if (body?.breakdown && typeof body.breakdown === 'object') return body.breakdown;
  if (body?.data && !Array.isArray(body.data) && typeof body.data === 'object') return body.data;
  return body;
};

export const assertQuoteContract = (quote, label = 'quote') => {
  if (!quote || typeof quote !== 'object') {
    throw new GateError(`${label} response is not an object`, 'QUOTE_CONTRACT_INVALID');
  }
  for (const field of ['quote_id', 'input_fingerprint', 'snapshot_hash', 'expires_at', 'service_code']) {
    if (typeof quote[field] !== 'string' || quote[field].trim() === '') {
      throw new GateError(`${label} is missing ${field}`, 'QUOTE_CONTRACT_INVALID');
    }
  }
  const expiresAt = Date.parse(quote.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new GateError(`${label} is already expired`, 'QUOTE_CONTRACT_INVALID');
  }
  if (quote.currency !== 'IDR') {
    throw new GateError(`${label} currency is not IDR`, 'QUOTE_CONTRACT_INVALID');
  }
  const total = finiteNumber(quote.total_price_idr);
  if (total === null || total <= 0) {
    throw new GateError(`${label} has no positive server total`, 'QUOTE_CONTRACT_INVALID');
  }
  if (quote.price_components?.total_price_idr !== undefined) {
    const componentTotal = finiteNumber(quote.price_components.total_price_idr);
    if (componentTotal !== total) {
      throw new GateError(`${label} price component total differs from total`, 'QUOTE_CONTRACT_INVALID');
    }
  }
  return quote;
};

export const quoteParityProjection = (quote) => Object.fromEntries(
  PRICE_FIELDS.map((field) => [field, quote?.[field] ?? null]),
);

export const assertQuoteParity = (first, second, labels = ['mobile', 'web']) => {
  const left = quoteParityProjection(first);
  const right = quoteParityProjection(second);
  for (const field of PRICE_FIELDS) {
    if (JSON.stringify(left[field]) !== JSON.stringify(right[field])) {
      throw new GateError(
        `Quote parity mismatch for ${field} (${labels[0]} vs ${labels[1]})`,
        'QUOTE_PARITY_MISMATCH',
      );
    }
  }
  return true;
};

export const assertRequoteResponse = (result, label) => {
  if (result?.status !== 409 || responseCode(result.body) !== 'REQUOTE_REQUIRED') {
    throw new GateError(
      `${label} must return HTTP 409 REQUOTE_REQUIRED`,
      'QUOTE_INVALIDATION_NOT_ENFORCED',
      result?.status ?? null,
    );
  }
  if (result.body?.requires_requote !== true) {
    throw new GateError(`${label} did not set requires_requote=true`, 'QUOTE_INVALIDATION_NOT_ENFORCED');
  }
  const currentTotal = finiteNumber(result.body?.trusted_price_breakdown?.total_price_idr);
  if (currentTotal === null || currentTotal <= 0) {
    throw new GateError(`${label} did not return the current server total`, 'QUOTE_INVALIDATION_NOT_ENFORCED');
  }
  return true;
};

const orderIdFrom = (body) => String(body?.order?.id || body?.order_id || body?.id || '').trim();

export const assertConcurrentCreateResults = (results, attempts = CONCURRENT_ATTEMPTS) => {
  if (!Array.isArray(results) || results.length !== attempts) {
    throw new GateError(`Expected ${attempts} concurrent responses`, 'IDEMPOTENCY_CONCURRENCY_INVALID');
  }
  const unexpected = results.filter((result) => ![201, 409].includes(result?.status));
  if (unexpected.length > 0) {
    throw new GateError('Concurrent create returned an unexpected HTTP status', 'IDEMPOTENCY_CONCURRENCY_INVALID');
  }
  const created = results.filter((result) => result.status === 201);
  const winners = created.filter((result) => !isReplayedResponse(result));
  if (winners.length !== 1) {
    throw new GateError(`Expected exactly one create winner, got ${winners.length}`, 'IDEMPOTENCY_CONCURRENCY_INVALID');
  }
  const orderIds = new Set(results.map((result) => orderIdFrom(result.body)).filter(Boolean));
  if (orderIds.size !== 1) {
    throw new GateError(`Expected one order reference, got ${orderIds.size}`, 'IDEMPOTENCY_CONCURRENCY_INVALID');
  }
  const allowedConflictCodes = new Set([
    'IDEMPOTENCY_REQUEST_IN_PROGRESS',
    'IDEMPOTENCY_STATE_CONFLICT',
  ]);
  for (const result of results.filter((item) => item.status === 409)) {
    if (!allowedConflictCodes.has(responseCode(result.body))) {
      throw new GateError('Concurrent loser returned an unexpected conflict code', 'IDEMPOTENCY_CONCURRENCY_INVALID');
    }
  }
  return {
    orderId: [...orderIds][0],
    createdCount: winners.length,
    replayedCount: created.length - winners.length,
    conflictCount: results.filter((result) => result.status === 409).length,
  };
};

export const assertReplayResponse = (result, orderId) => {
  if (result?.status !== 201 || orderIdFrom(result.body) !== orderId) {
    throw new GateError('Completed retry did not replay the original order', 'IDEMPOTENCY_REPLAY_INVALID');
  }
  if (String(result.headers?.get?.('x-idempotency-replayed') || '').toLowerCase() !== 'true') {
    throw new GateError('Completed retry did not carry X-Idempotency-Replayed=true', 'IDEMPOTENCY_REPLAY_INVALID');
  }
  return true;
};

export const assertKeyConflictResponse = (result) => {
  if (result?.status !== 409 || responseCode(result.body) !== 'IDEMPOTENCY_KEY_CONFLICT') {
    throw new GateError('Same key with a different payload was not rejected', 'IDEMPOTENCY_KEY_CONFLICT_MISSING');
  }
  return true;
};

export const assertPersistedDatabaseRow = (row, quote, expectedOrderId) => {
  if (!row || Number(row.order_count) !== 1 || String(row.order_id) !== expectedOrderId) {
    throw new GateError('Database did not contain exactly one owned order', 'DATABASE_ORDER_PERSISTENCE_INVALID');
  }
  if (Number(row.payment_count) !== 1) {
    throw new GateError('Database did not contain exactly one payment obligation', 'DATABASE_FINANCIAL_PERSISTENCE_INVALID');
  }
  if (Number(row.idempotency_count) !== 1) {
    throw new GateError('Database did not contain exactly one create idempotency row', 'DATABASE_IDEMPOTENCY_INVALID');
  }
  if (String(row.quote_id || '') !== String(quote.quote_id)) {
    throw new GateError('Persisted order quote_id differs from the authoritative quote', 'DATABASE_QUOTE_SNAPSHOT_INVALID');
  }
  let snapshot = row.pricing_snapshot;
  if (typeof snapshot === 'string') {
    try {
      snapshot = JSON.parse(snapshot);
    } catch {
      throw new GateError('orders.pricing_snapshot is not valid JSON', 'DATABASE_QUOTE_SNAPSHOT_INVALID');
    }
  }
  if (!snapshot || snapshot.quote_id !== quote.quote_id
    || snapshot.input_fingerprint !== quote.input_fingerprint
    || snapshot.snapshot_hash !== quote.snapshot_hash
    || Number(snapshot.total_price_idr) !== Number(quote.total_price_idr)
    || String(snapshot.currency) !== String(quote.currency)) {
    throw new GateError('orders.pricing_snapshot is not the exact authoritative quote', 'DATABASE_QUOTE_SNAPSHOT_INVALID');
  }
  return true;
};

const parseSetCookies = (headers) => {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const combined = headers.get('set-cookie') || '';
  return combined.split(/,(?=[^;,\s]+=)/).filter(Boolean);
};

const cookieValue = (setCookies, name) => {
  for (const cookie of setCookies) {
    const match = cookie.match(new RegExp(`^${name}=([^;]*)`));
    if (match) return match[1];
  }
  return '';
};

const requestJson = async (apiBase, path, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 30_000);
  const headers = {
    accept: 'application/json',
    ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(options.headers || {}),
  };
  try {
    const response = await fetch(`${apiBase}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
    }
    return { status: response.status, body, headers: response.headers };
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'request timed out' : 'request failed';
    throw new GateError(`${reason} for ${path}`, 'STAGING_HTTP_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
};

const expectSuccessful = (result, label) => {
  if (result.status < 200 || result.status >= 300) {
    throw new GateError(`${label} returned HTTP ${result.status} (${responseCode(result.body) || 'no-code'})`, 'STAGING_CONTRACT_REQUEST_FAILED', result.status);
  }
  return result.body;
};

const authHeaders = (token, deviceId) => ({
  authorization: `Bearer ${token}`,
  'user-agent': 'lancar-core-part-a-gate/1',
  'x-client-device-id': deviceId,
});

const buildDraft = (serviceCode) => {
  const pickup = { lat: -6.175392, lng: 106.827153 };
  const dropoff = { lat: -6.21462, lng: 106.84513 };
  const packageDetails = {
    category: 'document',
    item_description: 'LANCAR staging gate package',
    quantity: 1,
    weight_kg: 1,
    dimensions: { length: 20, width: 15, height: 10 },
    dimensions_scanned: false,
    is_fragile: false,
    is_prohibited: false,
    requires_delivery_code: false,
    item_value_idr: 0,
    size_tier: 'small',
  };
  return {
    pickup_address: 'Monas, Gambir, Jakarta Pusat',
    pickup_location: pickup,
    dropoff_address: 'GBK, Tanah Abang, Jakarta Pusat',
    dropoff_location: dropoff,
    recipient_name: process.env.STAGING_CORE_GATE_RECIPIENT_NAME || 'LANCAR Staging Gate',
    recipient_phone: process.env.STAGING_CORE_GATE_RECIPIENT_PHONE || '628000000000',
    package_details: packageDetails,
    packages: [{
      package_code: 'CORE-GATE-01',
      category: packageDetails.category,
      item_description: packageDetails.item_description,
      quantity: packageDetails.quantity,
      weight_kg: packageDetails.weight_kg,
      dimensions: packageDetails.dimensions,
      dimensions_scanned: packageDetails.dimensions_scanned,
      is_fragile: packageDetails.is_fragile,
      is_prohibited: packageDetails.is_prohibited,
      requires_delivery_code: packageDetails.requires_delivery_code,
      declared_value_idr: packageDetails.item_value_idr,
      size_tier: packageDetails.size_tier,
    }],
    service_code: serviceCode,
    size_tier: 'small',
    has_insurance: false,
    item_value: 0,
    dimension_scan_verified: false,
    schedule_type: 'now',
    customer_notes: 'Automated staging contract gate',
    payment_method: 'midtrans',
  };
};

const buildCreatePayload = (draft, quote) => ({
  ...draft,
  price_breakdown: quote,
  quote_id: quote.quote_id,
  quote_input_fingerprint: quote.input_fingerprint,
  quote_snapshot_hash: quote.snapshot_hash,
  quote_expires_at: quote.expires_at,
  quote_total_price_idr: quote.total_price_idr,
});

const clone = (value) => structuredClone(value);

const databaseEnvironment = (dsn) => {
  let parsed;
  try { parsed = new URL(dsn); } catch { throw new GateError('STAGING_CORE_GATE_DATABASE_URL is not a valid PostgreSQL URL', 'GATE_DATABASE_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new GateError('STAGING_CORE_GATE_DATABASE_URL must use postgres:// or postgresql://', 'GATE_DATABASE_URL_INVALID');
  }
  const environment = { ...process.env };
  environment.PGHOST = parsed.hostname;
  environment.PGPORT = parsed.port || '5432';
  environment.PGUSER = decodeURIComponent(parsed.username);
  environment.PGPASSWORD = decodeURIComponent(parsed.password);
  environment.PGDATABASE = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const sslmode = parsed.searchParams.get('sslmode');
  if (sslmode) environment.PGSSLMODE = sslmode;
  return environment;
};

const queryPersistedDatabase = (dsn, actorId, orderId, idempotencyKey) => {
  if (!dsn) {
    throw new GateError('STAGING_CORE_GATE_DATABASE_URL is required for persisted database proof', 'GATE_DATABASE_CONFIG_MISSING');
  }
  const query = String.raw`
SELECT json_build_object(
  'order_id', o.id::text,
  'order_count', 1,
  'customer_id', o.customer_id::text,
  'quote_id', o.quote_id,
  'total_price_idr', o.total_price_idr,
  'pricing_snapshot', o.pricing_snapshot,
  'payment_count', (SELECT COUNT(*) FROM payments p WHERE p.order_id = o.id),
  'idempotency_count', (SELECT COUNT(*) FROM api_idempotency_keys k
                         WHERE k.scope = 'customer.order.create'
                           AND k.actor_key = :'actor_id'
                           AND k.idempotency_key = :'idempotency_key')
)::text
FROM orders o
WHERE o.id = :'order_id'::uuid
  AND o.customer_id = :'actor_id'::uuid;
`;
  const result = spawnSync('psql', [
    '--no-psqlrc',
    '--quiet',
    '--tuples-only',
    '--no-align',
    '--set=ON_ERROR_STOP=1',
    `--set=actor_id=${actorId}`,
    `--set=order_id=${orderId}`,
    `--set=idempotency_key=${idempotencyKey}`,
    '--command',
    query,
  ], { env: databaseEnvironment(dsn), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error?.code === 'ENOENT') {
    throw new GateError('psql is required for staging database proof', 'GATE_DATABASE_CLIENT_MISSING');
  }
  if (result.status !== 0) {
    throw new GateError('staging database query failed', 'GATE_DATABASE_QUERY_FAILED');
  }
  const output = String(result.stdout || '').trim();
  if (!output) return null;
  try { return JSON.parse(output); } catch { throw new GateError('staging database returned invalid JSON', 'GATE_DATABASE_QUERY_FAILED'); }
};

const obtainToken = async (apiBase, deviceId) => {
  if (String(process.env.STAGING_CORE_GATE_ACCESS_TOKEN || '').trim()) {
    return String(process.env.STAGING_CORE_GATE_ACCESS_TOKEN).trim();
  }
  const email = String(process.env.STAGING_CORE_GATE_TEST_USER_EMAIL || process.env.TEST_USER_EMAIL || '').trim();
  const password = String(process.env.STAGING_CORE_GATE_TEST_USER_PASSWORD || process.env.TEST_USER_PASSWORD || '').trim();
  if (!email || !password) {
    throw new GateError('staging customer credentials or STAGING_CORE_GATE_ACCESS_TOKEN are required', 'GATE_AUTH_CONFIG_MISSING');
  }
  const result = await requestJson(apiBase, '/auth/customer/login/start', {
    method: 'POST',
    body: { email, password, device_id: deviceId, device_info: { source: 'github_actions_core_part_a' } },
  });
  const token = String(result.body?.access_token || '').trim();
  if (token) return token;
  if (result.body?.require_otp === true) {
    throw new GateError('staging customer login requires OTP; provide a trusted gate device or pre-issued access token', 'GATE_AUTH_OTP_REQUIRED', result.status);
  }
  throw new GateError(`staging customer login failed (HTTP ${result.status})`, 'GATE_AUTH_FAILED', result.status);
};

const runGate = async () => {
  if (process.env.STAGING_GATE_ALLOW_MUTATIONS !== 'true'
    || process.env.STAGING_GATE_CONFIRM !== MUTATION_CONFIRMATION) {
    throw new GateError(
      `mutating staging gate is disabled; set STAGING_GATE_ALLOW_MUTATIONS=true and STAGING_GATE_CONFIRM=${MUTATION_CONFIRMATION}`,
      'GATE_MUTATION_CONFIRMATION_REQUIRED',
    );
  }
  const apiBase = normalizeApiBase(process.env.STAGING_CORE_GATE_API_URL || process.env.STAGING_SERVER_API_URL);
  const deviceId = String(process.env.STAGING_CORE_GATE_DEVICE_ID || DEFAULT_DEVICE_ID).trim();
  const token = await obtainToken(apiBase, deviceId);
  const bearer = authHeaders(token, deviceId);
  const me = expectSuccessful(await requestJson(apiBase, '/users/me', { headers: bearer }), 'authenticated user lookup');
  const actorId = String(me?.user?.id || me?.id || '').trim();
  if (!actorId) throw new GateError('authenticated user lookup did not return an id', 'GATE_AUTH_USER_INVALID');

  const services = expectSuccessful(await requestJson(apiBase, '/customer/delivery-services', { headers: bearer }), 'delivery service lookup');
  const availableServices = Array.isArray(services?.services) ? services.services : (Array.isArray(services?.data) ? services.data : []);
  const configuredService = String(process.env.STAGING_CORE_GATE_SERVICE_CODE || DEFAULT_SERVICE_CODE).trim().toLowerCase();
  const baseService = availableServices.find((item) => String(item?.code || '').toLowerCase() === configuredService);
  if (!baseService) throw new GateError(`configured base service ${configuredService} is not enabled in staging`, 'GATE_SERVICE_CONFIG_INVALID');
  const configuredAlternate = String(process.env.STAGING_CORE_GATE_ALT_SERVICE_CODE || DEFAULT_ALT_SERVICE_CODE).trim().toLowerCase();
  const alternateService = availableServices.find((item) => String(item?.code || '').toLowerCase() === configuredAlternate)
    || availableServices.find((item) => String(item?.code || '').toLowerCase() !== configuredService && item?.route_model === 'p2p');
  if (!alternateService) throw new GateError('no enabled alternate p2p service is available for changed-service invalidation', 'GATE_ALT_SERVICE_MISSING');

  const draft = buildDraft(configuredService);
  const mobileQuote = assertQuoteContract(
    quoteBody(expectSuccessful(await requestJson(apiBase, '/customer/orders/calculate', { method: 'POST', headers: bearer, body: draft }))),
    'mobile quote',
  );

  const origin = String(process.env.STAGING_CORE_GATE_ORIGIN || process.env.STAGING_URL || '').trim();
  if (!origin) throw new GateError('STAGING_CORE_GATE_ORIGIN or STAGING_URL is required for web parity', 'GATE_WEB_ORIGIN_MISSING');
  const exchange = await requestJson(apiBase, '/auth/web/session/exchange', {
    method: 'POST',
    headers: { origin },
    body: { access_token: token },
  });
  const cookies = parseSetCookies(exchange.headers);
  const customerSession = cookieValue(cookies, 'customer_session');
  const csrfToken = cookieValue(cookies, 'csrf_token');
  if (exchange.status < 200 || exchange.status >= 300 || !customerSession || !csrfToken) {
    throw new GateError('customer web session exchange did not return the required cookies', 'GATE_WEB_SESSION_INVALID', exchange.status);
  }
  const webHeaders = {
    origin,
    cookie: `customer_session=${customerSession}; csrf_token=${csrfToken}`,
    'x-csrf-token': csrfToken,
    'user-agent': 'lancar-core-part-a-gate/1',
  };
  const webQuote = assertQuoteContract(
    quoteBody(expectSuccessful(await requestJson(apiBase, '/auth/web/orders/calculate', { method: 'POST', headers: webHeaders, body: draft }))),
    'web quote',
  );
  assertQuoteParity(mobileQuote, webQuote);

  const basePayload = buildCreatePayload(draft, mobileQuote);
  const idempotencyKey = `core-part-a-${crypto.randomUUID()}`;
  const createOptions = { method: 'POST', headers: { ...bearer, 'x-idempotency-key': idempotencyKey }, body: basePayload };
  const concurrentResults = await Promise.all(
    Array.from({ length: CONCURRENT_ATTEMPTS }, () => requestJson(apiBase, '/customer/orders', createOptions)),
  );
  const concurrency = assertConcurrentCreateResults(concurrentResults);
  const orderId = concurrency.orderId;

  const replay = await requestJson(apiBase, '/customer/orders', createOptions);
  assertReplayResponse(replay, orderId);
  const changedPayload = clone(basePayload);
  changedPayload.customer_notes = `${changedPayload.customer_notes} changed-key-payload`;
  assertKeyConflictResponse(await requestJson(apiBase, '/customer/orders', {
    method: 'POST',
    headers: { ...bearer, 'x-idempotency-key': idempotencyKey },
    body: changedPayload,
  }));

  const invalidations = [
    ['expired quote', (() => {
      const payload = clone(basePayload);
      payload.quote_expires_at = new Date(Date.now() - 60_000).toISOString();
      return payload;
    })()],
    ['changed address', (() => {
      const payload = clone(basePayload);
      payload.dropoff_address = 'Kota Tua, Jakarta Barat';
      payload.dropoff_location = { lat: -6.1352, lng: 106.8133 };
      return payload;
    })()],
    ['changed package', (() => {
      const payload = clone(basePayload);
      payload.package_details.weight_kg = 2.5;
      payload.packages[0].weight_kg = 2.5;
      payload.package_details.dimensions = { length: 25, width: 20, height: 15 };
      payload.packages[0].dimensions = payload.package_details.dimensions;
      return payload;
    })()],
    ['changed service', (() => {
      const payload = clone(basePayload);
      const alternateCode = String(alternateService.code).toLowerCase();
      payload.service_code = alternateCode;
      payload.price_breakdown.service_code = alternateCode;
      return payload;
    })()],
  ];
  for (const [label, payload] of invalidations) {
    const key = `core-part-a-${label.replace(/[^a-z0-9]+/gi, '-')}-${crypto.randomUUID()}`;
    assertRequoteResponse(await requestJson(apiBase, '/customer/orders', {
      method: 'POST',
      headers: { ...bearer, 'x-idempotency-key': key },
      body: payload,
    }), label);
  }

  const databaseRow = queryPersistedDatabase(
    String(process.env.STAGING_CORE_GATE_DATABASE_URL || '').trim(),
    actorId,
    orderId,
    idempotencyKey,
  );
  if (!databaseRow) throw new GateError('staging database did not return the created order', 'DATABASE_ORDER_PERSISTENCE_INVALID');
  assertPersistedDatabaseRow(databaseRow, mobileQuote, orderId);

  if (process.env.STAGING_CORE_GATE_CLEANUP === 'true') {
    const cleanup = await requestJson(apiBase, `/customer/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: 'POST',
      headers: bearer,
      body: { reason: 'Automated CORE-2026 staging contract gate cleanup' },
    });
    if (cleanup.status < 200 || cleanup.status >= 300) {
      throw new GateError('staging gate order cleanup failed', 'GATE_CLEANUP_FAILED', cleanup.status);
    }
  }

  console.log(JSON.stringify({
    task_ids: ['CORE-2026-001', 'CORE-2026-002', 'CORE-2026-003'],
    authenticated: true,
    quote_parity: 'PASS',
    quote_invalidations: invalidations.length,
    concurrent_attempts: CONCURRENT_ATTEMPTS,
    created_order_count: concurrency.createdCount,
    replayed_order_count: concurrency.replayedCount,
    conflict_count: concurrency.conflictCount,
    replay: 'PASS',
    persisted_order_count: databaseRow.order_count,
    persisted_payment_count: databaseRow.payment_count,
    persisted_idempotency_count: databaseRow.idempotency_count,
    cleanup: process.env.STAGING_CORE_GATE_CLEANUP === 'true' ? 'PASS' : 'NOT_REQUESTED',
  }));
};

export const run = runGate;

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runGate().catch((error) => {
    const code = error?.code || 'STAGING_CORE_GATE_FAILED';
    console.error(`STAGING_CORE_GATE_FAIL ${code}: ${error?.message || 'unknown failure'}`);
    process.exitCode = 1;
  });
}
