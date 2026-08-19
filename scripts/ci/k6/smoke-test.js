// k6 smoke/load test — LANCAR staging API
// Strategy: login dengan akun demo (device_id statis agar token langsung
// bila device trusted; bila RequireOTP, fallback ke public endpoints).
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: __ENV.K6_VUS ? Number(__ENV.K6_VUS) : 10,
  duration: __ENV.K6_DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

const BASE = __ENV.K6_BASE_URL || 'https://api.bawain.my.id';
const API = `${BASE}/api/v1`;
const EMAIL = __ENV.TEST_USER_EMAIL || 'customer@tembus.id';
const PASSWORD = __ENV.TEST_USER_PASSWORD || 'Customer123!';
const DEVICE_ID = __ENV.K6_DEVICE_ID || 'k6-load-20260819';

export default function () {
  // 1. Health (public, tanpa auth)
  const health = http.get(`${BASE}/health`);
  check(health, { 'health 200': (r) => r.status === 200 });

  // 2. Login (customer password login)
  const login = http.post(
    `${API}/auth/customer/login/start`,
    JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      device_id: DEVICE_ID,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const okLogin = check(login, {
    'login 200': (r) => r.status === 200,
  });

  const token = login.json('access_token') || '';
  const requireOtp = login.json('require_otp') === true;

  if (okLogin && token) {
    const me = http.get(`${API}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    check(me, { 'users/me 200': (r) => r.status === 200 });

    // 3. Endpoint order (list — kalau tersedia untuk role)
    const orders = http.get(`${API}/orders?limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    check(orders, {
      'orders 2xx': (r) => r.status >= 200 && r.status < 300,
    });
  } else if (requireOtp) {
    // Perangkat baru butuh OTP — tidak bisa lanjut ber-auth.
    // Catatan: gunakan K6_DEVICE_ID yang sudah trusted, atau
    // biarkan sebagai indikator bahwa device perlu di-whitelist.
    console.warn(`RequireOTP=true untuk ${EMAIL} (device ${DEVICE_ID}) — hanya health diukur.`);
  }

  sleep(1);
}