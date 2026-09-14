// PAYPLAT-2026-010 bounded peak rehearsal for the canonical staging API.
//
// This profile deliberately uses only the local/staging payment-intent event
// inbox. It never calls a vendor-live payment endpoint. Checkout orders carry
// a unique customer_notes run marker so the staging harness can remove only
// its own disposable rows after the run.
import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = (__ENV.BASE_URL || 'https://api.bawain.my.id').replace(/\/$/, '');
const PAYMENT_BASE = (__ENV.PAYMENT_BASE_URL || BASE).replace(/\/$/, '');
const CUSTOMER_TOKEN = __ENV.CUSTOMER_TOKEN || '';
const CUSTOMER_USER_ID = __ENV.CUSTOMER_USER_ID || '';
const INTERNAL_PAYMENT_API_KEY = __ENV.INTERNAL_PAYMENT_API_KEY || '';
const PAYMENT_INTENT_ID = __ENV.PAYMENT_INTENT_ID || '';
const RUN_ID = (__ENV.PAYPLAT_RUN_ID || `payplat-010-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '-');
const WORKER_ID = __ENV.PAYPLAT_WORKER_ID || 'single';
const PROFILE_DURATION = __ENV.PROFILE_DURATION || '30s';
// k6 arrival-rate values are integer requests per second. The default is the
// ceiling of the forecast × 1.5 profile (112.5 / 22.5 / 22.5).
const QUOTE_RPS = Number(__ENV.QUOTE_RPS || 113);
const CHECKOUT_RPS = Number(__ENV.CHECKOUT_RPS || 23);
const CALLBACK_RPS = Number(__ENV.CALLBACK_RPS || 23);

const quoteLatency = new Trend('payplat_quote_latency_ms');
const checkoutLatency = new Trend('payplat_checkout_latency_ms');
const callbackLatency = new Trend('payplat_callback_latency_ms');
const checkoutFailures = new Rate('payplat_checkout_failures');

export const options = {
  scenarios: {
    quote_peak: {
      executor: 'constant-arrival-rate',
      exec: 'quotePeak',
      rate: QUOTE_RPS,
      timeUnit: '1s',
      preAllocatedVUs: Math.max(20, Math.ceil(QUOTE_RPS / 3)),
      maxVUs: Math.max(100, Math.ceil(QUOTE_RPS * 3)),
      duration: PROFILE_DURATION,
    },
    checkout_peak: {
      executor: 'constant-arrival-rate',
      exec: 'checkoutPeak',
      rate: CHECKOUT_RPS,
      timeUnit: '1s',
      preAllocatedVUs: Math.max(10, Math.ceil(CHECKOUT_RPS * 2)),
      maxVUs: Math.max(60, Math.ceil(CHECKOUT_RPS * 5)),
      duration: PROFILE_DURATION,
    },
    payment_webhook_peak: {
      executor: 'constant-arrival-rate',
      exec: 'paymentWebhookPeak',
      rate: CALLBACK_RPS,
      timeUnit: '1s',
      preAllocatedVUs: Math.max(10, Math.ceil(CALLBACK_RPS * 2)),
      maxVUs: Math.max(60, Math.ceil(CALLBACK_RPS * 5)),
      duration: PROFILE_DURATION,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    payplat_quote_latency_ms: ['p(95)<1500'],
    payplat_checkout_latency_ms: ['p(95)<2000'],
    payplat_callback_latency_ms: ['p(95)<1000'],
    payplat_checkout_failures: ['rate<0.05'],
  },
};

const jsonHeaders = (idempotencyKey) => {
  const headers = {
    Authorization: `Bearer ${CUSTOMER_TOKEN}`,
    'Content-Type': 'application/json',
    'X-Device-Id': __ENV.DEVICE_ID || 'k6-payplat-010',
    'X-Correlation-Id': `${RUN_ID}-${WORKER_ID}-${__VU}-${__ITER}`,
  };
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
  return headers;
};

const route = {
  pickup_address: 'Halim HSR Station, Jakarta Timur',
  pickup_location: { lat: -6.25052, lng: 106.88576, accuracy_m: 10, source: 'load-test' },
  dropoff_address: 'Monumen Nasional, Jakarta Pusat',
  dropoff_location: { lat: -6.17539, lng: 106.82715, accuracy_m: 10, source: 'load-test' },
};

const packageDetails = {
  item_description: 'PAYPLAT-2026-010 disposable staging package',
  category: 'document',
  weight_kg: 1,
  quantity: 1,
  dangerous_goods: false,
  vehicle_type: 'motor',
  size_tier: 'small',
};

const quotePayload = () => ({
  pickup: { lat: route.pickup_location.lat, lng: route.pickup_location.lng },
  dropoff: { lat: route.dropoff_location.lat, lng: route.dropoff_location.lng },
  dimensions: { length_cm: 0, width_cm: 0, height_cm: 0 },
  package_details: packageDetails,
  weight_kg: 1,
  service_code: 'tembus_instant',
  size_tier: 'small',
  item_value: 0,
  recipient_name: `PAYPLAT load ${__VU}`,
  recipient_phone: '+6287885358663',
});

export function quotePeak() {
  if (!CUSTOMER_TOKEN) throw new Error('CUSTOMER_TOKEN is required');
  const startedAt = Date.now();
  const response = http.post(`${BASE}/api/v1/customer/orders/calculate`, JSON.stringify(quotePayload()), { headers: jsonHeaders() });
  quoteLatency.add(Date.now() - startedAt);
  check(response, { 'quote returned authoritative id': (res) => res.status === 200 && Boolean(res.json('quote_id')) });
}

export function checkoutPeak() {
  if (!CUSTOMER_TOKEN) throw new Error('CUSTOMER_TOKEN is required');
  const quoteResponse = http.post(`${BASE}/api/v1/customer/orders/calculate`, JSON.stringify(quotePayload()), { headers: jsonHeaders() });
  const quote = quoteResponse.status === 200 ? quoteResponse.json() : null;
  check(quoteResponse, { 'checkout quote available': (res) => res.status === 200 && Boolean(res.json('quote_id')) });
  if (!quote || !quote.quote_id) {
    checkoutFailures.add(1);
    return;
  }
  const startedAt = Date.now();
  const response = http.post(`${BASE}/api/v1/customer/orders`, JSON.stringify({
    pickup_address: route.pickup_address,
    pickup_location: route.pickup_location,
    dropoff_address: route.dropoff_address,
    dropoff_location: route.dropoff_location,
    recipient_name: `PAYPLAT load ${__VU}`,
    recipient_phone: '+6287885358663',
    package_details: packageDetails,
    packages: [{ description: packageDetails.item_description, category: packageDetails.category, weight_kg: 1, quantity: 1 }],
    service_code: 'tembus_instant',
    payment_method: 'lapay',
    schedule_type: 'now',
    quote_id: quote.quote_id,
    quote_input_fingerprint: quote.input_fingerprint,
    quote_snapshot_hash: quote.snapshot_hash,
    quote_expires_at: quote.expires_at,
    quote_total_price_idr: quote.total_price_idr,
    price_breakdown: quote,
    customer_notes: `${RUN_ID}-${WORKER_ID}-${__VU}-${__ITER}`,
  }), { headers: jsonHeaders(`${RUN_ID}-order-${WORKER_ID}-${__VU}-${__ITER}`) });
  checkoutLatency.add(Date.now() - startedAt);
  const successful = response.status === 201 && response.json('success') === true;
  checkoutFailures.add(successful ? 0 : 1);
  check(response, { 'checkout created': () => successful });
}

export function paymentWebhookPeak() {
  if (!INTERNAL_PAYMENT_API_KEY || !PAYMENT_INTENT_ID || !CUSTOMER_USER_ID) {
    throw new Error('INTERNAL_PAYMENT_API_KEY, PAYMENT_INTENT_ID and CUSTOMER_USER_ID are required');
  }
  const startedAt = Date.now();
  const response = http.post(`${PAYMENT_BASE}/api/internal/payment-intents/events`, JSON.stringify({
    intent_id: PAYMENT_INTENT_ID,
    event_id: `${RUN_ID}-callback-${WORKER_ID}-${__VU}-${__ITER}`,
    source: 'provider_webhook',
    provider_raw_status: 'processing',
    normalized_state: 'PROCESSING',
    provider_reference: `${RUN_ID}-${WORKER_ID}-${PAYMENT_INTENT_ID}`,
    occurred_at: new Date().toISOString(),
  }), {
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-API-Key': INTERNAL_PAYMENT_API_KEY,
    },
  });
  callbackLatency.add(Date.now() - startedAt);
  check(response, { 'payment callback accepted': (res) => res.status === 200 });
}
