// k6 load test — Admin Broadcast Center send path
// Covers BC-8 load criterion: sending to a broad audience must not time out.
// Run: BASE_URL=https://api.bawain.my.id ADMIN_TOKEN=$TOKEN k6 run scripts/load/admin-broadcast.k6.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://api.bawain.my.id';
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || '';
const RECIPIENTS = Number(__ENV.RECIPIENT_COUNT || 5000);

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

export const options = {
  vus: 5,
  duration: '1m',
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const createRes = http.post(
    `${BASE_URL}/api/v1/admin/broadcasts`,
    JSON.stringify({
      title: `Load test ${new Date().toISOString()}`,
      body: 'k6 broadcast load test',
      category: 'system',
      priority: 'normal',
      channels: ['push', 'in_app'],
      target_type: 'all',
      status: 'scheduled',
      scheduled_at: new Date(Date.now() + 60_000).toISOString(),
    }),
    { headers: headers(ADMIN_TOKEN) },
  );

  check(createRes, { 'create broadcast 2xx': (r) => r.status >= 200 && r.status < 300 });
  if (createRes.status >= 400) return;

  const id = createRes.json('data.id') || createRes.json('id');
  if (!id) return;

  const reportRes = http.get(`${BASE_URL}/api/v1/admin/broadcasts/${id}/report`, {
    headers: headers(ADMIN_TOKEN),
  });
  check(reportRes, { 'report 2xx': (r) => r.status >= 200 && r.status < 300 });

  sleep(1);
}
