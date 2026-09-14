// Bounded payment orchestration rehearsal for PAYPLAT-2026-010.
// It deliberately replays one provider event id under concurrent VUs: this
// exercises checkout status reads plus callback deduplication without creating
// a new charge per iteration. The intent/user are disposable staging fixtures.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = (__ENV.PAYMENT_BASE_URL || 'http://host.docker.internal:8084').replace(/\/$/, '');
const INTENT_ID = __ENV.PAYMENT_INTENT_ID || '';
const USER_ID = __ENV.PAYMENT_USER_ID || '';
const INTERNAL_KEY = __ENV.INTERNAL_PAYMENT_API_KEY || '';
const EVENT_ID = __ENV.PAYMENT_EVENT_ID || 'staging-payplat-010-processing';

export const options = {
  vus: __ENV.K6_VUS ? Number(__ENV.K6_VUS) : 5,
  duration: __ENV.K6_DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<750'],
  },
};

export default function () {
  if (!INTENT_ID || !USER_ID || !INTERNAL_KEY) {
    throw new Error('PAYMENT_INTENT_ID, PAYMENT_USER_ID and INTERNAL_PAYMENT_API_KEY are required');
  }

  const status = http.get(`${BASE}/api/v1/payment-intents/${INTENT_ID}`, {
    headers: { 'X-User-ID': USER_ID },
    tags: { flow: 'checkout_payment_status' },
  });
  check(status, { 'checkout status 200': (response) => response.status === 200 });

  const callback = http.post(`${BASE}/api/internal/payment-intents/events`, JSON.stringify({
    intent_id: INTENT_ID,
    event_id: EVENT_ID,
    source: 'provider_webhook',
    provider_raw_status: 'processing',
    normalized_state: 'PROCESSING',
    provider_reference: `staging-${INTENT_ID}`,
    occurred_at: new Date().toISOString(),
  }), {
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-API-Key': INTERNAL_KEY,
    },
    tags: { flow: 'payment_webhook_callback' },
  });
  check(callback, {
    'callback success/replay': (response) => response.status === 200,
  });

  sleep(0.1);
}
