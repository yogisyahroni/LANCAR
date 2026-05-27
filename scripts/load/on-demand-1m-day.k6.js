import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL || 'http://localhost:8080';
const wsUrl = __ENV.WS_URL || baseUrl.replace(/^http/, 'ws');
const customerToken = __ENV.CUSTOMER_TOKEN || '';
const courierToken = __ENV.COURIER_TOKEN || '';
const adminToken = __ENV.ADMIN_TOKEN || '';

const quoteLatency = new Trend('tembus_quote_latency_ms');
const createOrderLatency = new Trend('tembus_create_order_latency_ms');
const trackingLatency = new Trend('tembus_tracking_latency_ms');
const paymentCallbackLatency = new Trend('tembus_payment_callback_latency_ms');
const websocketConnected = new Rate('tembus_websocket_connected');

export const options = {
  scenarios: {
    customer_mobile_quote: {
      executor: 'ramping-arrival-rate',
      exec: 'customerQuote',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 80,
      maxVUs: 500,
      stages: [
        { target: Number(__ENV.QUOTE_RPS || 250), duration: '3m' },
        { target: Number(__ENV.QUOTE_RPS || 250), duration: '10m' },
        { target: 0, duration: '1m' },
      ],
    },
    customer_mobile_create_order: {
      executor: 'ramping-arrival-rate',
      exec: 'customerCreateOrder',
      startRate: 2,
      timeUnit: '1s',
      preAllocatedVUs: 40,
      maxVUs: 300,
      stages: [
        { target: Number(__ENV.CREATE_ORDER_RPS || 25), duration: '3m' },
        { target: Number(__ENV.CREATE_ORDER_RPS || 25), duration: '10m' },
        { target: 0, duration: '1m' },
      ],
    },
    courier_tracking_ping: {
      executor: 'constant-arrival-rate',
      exec: 'courierTrackingPing',
      rate: Number(__ENV.TRACKING_RPS || 100),
      timeUnit: '1s',
      preAllocatedVUs: 80,
      maxVUs: 600,
      duration: __ENV.TRACKING_DURATION || '10m',
    },
    websocket_state_sync: {
      executor: 'constant-vus',
      exec: 'websocketStateSync',
      vus: Number(__ENV.WS_VUS || 25),
      duration: __ENV.WS_DURATION || '10m',
    },
    payment_callback_probe: {
      executor: 'constant-arrival-rate',
      exec: 'paymentCallbackProbe',
      rate: Number(__ENV.PAYMENT_CALLBACK_RPS || 5),
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 100,
      duration: __ENV.PAYMENT_DURATION || '10m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    tembus_quote_latency_ms: ['p(95)<800', 'p(99)<1500'],
    tembus_create_order_latency_ms: ['p(95)<1200', 'p(99)<2500'],
    tembus_tracking_latency_ms: ['p(95)<300', 'p(99)<800'],
    tembus_websocket_connected: ['rate>0.95'],
  },
};

const jsonHeaders = (token, idempotencyKey) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
  'X-Device-Id': __ENV.DEVICE_ID || `k6-${__VU}`,
  'X-Correlation-Id': `k6-${Date.now()}-${__VU}-${__ITER}`,
});

const pickup = {
  address: 'Halim HSR Station, Jakarta Timur',
  lat: -6.25052,
  lng: 106.88576,
};

const dropoff = {
  address: 'Monumen Nasional, Jakarta Pusat',
  lat: -6.17539,
  lng: 106.82715,
};

export function customerQuote() {
  const payload = JSON.stringify({
    pickup_address: pickup.address,
    pickup_lat: pickup.lat,
    pickup_lng: pickup.lng,
    dropoff_address: dropoff.address,
    dropoff_lat: dropoff.lat,
    dropoff_lng: dropoff.lng,
    package_type: 'document',
    package_weight_kg: 1,
    package_size: 'small',
    vehicle_type: 'motor',
  });

  const startedAt = Date.now();
  const response = http.post(`${baseUrl}/api/v1/customer/orders/calculate-all`, payload, {
    headers: jsonHeaders(customerToken),
    tags: { flow: 'customer_quote' },
  });
  quoteLatency.add(Date.now() - startedAt);
  check(response, {
    'quote returned 2xx/4xx controlled': (res) => res.status < 500,
  });
  sleep(0.1);
}

export function customerCreateOrder() {
  const idempotencyKey = `k6-order-${Date.now()}-${__VU}-${__ITER}`;
  const payload = JSON.stringify({
    pickup_address: pickup.address,
    pickup_lat: pickup.lat,
    pickup_lng: pickup.lng,
    dropoff_address: dropoff.address,
    dropoff_lat: dropoff.lat,
    dropoff_lng: dropoff.lng,
    recipient_name: `Load Receiver ${__VU}`,
    recipient_phone: '+6287885358663',
    package_type: 'Dokumen',
    package_weight_kg: 1,
    package_size: 'small',
    service_code: __ENV.SERVICE_CODE || 'TEMBUS_SAME_DAY',
    payment_method: 'lapay',
  });

  const startedAt = Date.now();
  const response = http.post(`${baseUrl}/api/v1/customer/orders`, payload, {
    headers: jsonHeaders(customerToken, idempotencyKey),
    tags: { flow: 'customer_create_order' },
  });
  createOrderLatency.add(Date.now() - startedAt);
  check(response, {
    'create order controlled': (res) => res.status < 500,
  });
  sleep(0.2);
}

export function courierTrackingPing() {
  const payload = JSON.stringify({
    lat: pickup.lat + Math.random() / 1000,
    lng: pickup.lng + Math.random() / 1000,
    accuracy_m: 12,
    source: 'k6',
  });

  const startedAt = Date.now();
  const response = http.post(`${baseUrl}/api/v1/courier/tracking/ping`, payload, {
    headers: jsonHeaders(courierToken),
    tags: { flow: 'courier_tracking' },
  });
  trackingLatency.add(Date.now() - startedAt);
  check(response, {
    'tracking controlled': (res) => res.status < 500,
  });
  sleep(0.05);
}

export function websocketStateSync() {
  const token = customerToken || courierToken || adminToken;
  const response = ws.connect(`${wsUrl}/socket.io/?EIO=4&transport=websocket&token=${encodeURIComponent(token)}`, {}, (socket) => {
    socket.on('open', () => {
      websocketConnected.add(1);
      socket.send('40');
    });
    socket.on('error', () => websocketConnected.add(0));
    socket.setTimeout(() => socket.close(), 15_000);
  });
  check(response, {
    'websocket handshake controlled': (res) => res && res.status < 500,
  });
}

export function paymentCallbackProbe() {
  const payload = JSON.stringify({
    order_id: __ENV.PAYMENT_ORDER_ID || '00000000-0000-0000-0000-000000000000',
    transaction_status: 'settlement',
    gross_amount: '10000',
    signature_key: __ENV.PAYMENT_SIGNATURE || 'load-test',
  });

  const startedAt = Date.now();
  const response = http.post(`${baseUrl}/api/v1/payments/midtrans/callback`, payload, {
    headers: jsonHeaders(adminToken, `k6-payment-${Date.now()}-${__VU}-${__ITER}`),
    tags: { flow: 'payment_callback' },
  });
  paymentCallbackLatency.add(Date.now() - startedAt);
  check(response, {
    'payment callback controlled': (res) => res.status < 500,
  });
  sleep(0.2);
}
