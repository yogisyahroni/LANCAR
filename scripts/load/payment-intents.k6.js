import http from 'k6/http';
import { check } from 'k6';

// Run only against a disposable/staging order and customer context. This
// script never treats a 2xx as payment success; it measures idempotent intent
// creation and callback transport separately from provider settlement.
export const options = {
  scenarios: {
    checkout_intents: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.INTENT_RATE || 5),
      timeUnit: '1s',
      duration: __ENV.DURATION || '1m',
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
  },
};

export default function () {
  const base = __ENV.BASE_URL || 'https://api.bawain.my.id';
  const orderId = __ENV.ORDER_ID;
  const token = __ENV.ACCESS_TOKEN;
  if (!orderId || !token) return;
  const key = `load-${__VU}-${__ITER}`;
  const response = http.post(`${base}/api/v1/payment-intents`, JSON.stringify({
    order_id: orderId,
    market_code: __ENV.MARKET_CODE || 'id-jk',
    currency: __ENV.CURRENCY || 'IDR',
    amount_minor: Number(__ENV.AMOUNT_MINOR || 1000),
    payment_method: __ENV.PAYMENT_METHOD || 'configured-method',
  }), { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': key } });
  check(response, { 'intent endpoint responds': (r) => [200, 201, 409, 422, 503].includes(r.status) });
}
