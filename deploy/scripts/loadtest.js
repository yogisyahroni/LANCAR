// =============================================================================
// TEMBUS Load Testing — k6 Benchmark Script
// =============================================================================
// Configuration via environment variables (no hardcoded values):
//   BASE_URL        — API base URL (default: http://localhost:8080)
//   VUS             — Virtual Users (default: 10)
//   DURATION        — Test duration (default: 60s)
//   RAMP_UP         — Ramp-up time (default: 10s)
//   AUTH_TOKEN      — JWT bearer token for authenticated requests
//   TEST_SCENARIO   — smoke | load | stress | spike (default: load)
//
// Usage:
//   k6 run loadtest.js
//   BASE_URL=https://api.tembus.id VUS=50 DURATION=5m k6 run loadtest.js
//   TEST_SCENARIO=stress k6 run loadtest.js
// =============================================================================

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const VUS = parseInt(__ENV.VUS || "10");
const DURATION = __ENV.DURATION || "60s";
const RAMP_UP = __ENV.RAMP_UP || "10s";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";
const SCENARIO = __ENV.TEST_SCENARIO || "load";

const scenarios = {
  smoke: { vus: 2, duration: "30s", ramp: "5s" },
  load: { vus: VUS, duration: DURATION, ramp: RAMP_UP },
  stress: { vus: Math.max(VUS, 50), duration: "5m", ramp: "30s" },
  spike: {
    stages: [
      { duration: "30s", target: 10 },
      { duration: "1m", target: 100 },
      { duration: "30s", target: 10 },
      { duration: "1m", target: 0 },
    ],
  },
};

const scenario = scenarios[SCENARIO] || scenarios.load;

export const options = {
  thresholds: {
    http_req_duration: ["p(95)<2000"], // 95% requests under 2s
    http_req_failed: ["rate<0.05"],     // <5% error rate
    "http_req_duration{name:search}": ["p(95)<3000"],
    "http_req_duration{name:order}": ["p(95)<5000"],
  },
};

// Generate random coordinates near Jakarta for realistic test data
function randomCoord() {
  const baseLat = -6.2;
  const baseLng = 106.8;
  return {
    lat: baseLat + (Math.random() - 0.5) * 0.1,
    lng: baseLng + (Math.random() - 0.5) * 0.1,
  };
}

const headers = {
  "Content-Type": "application/json",
  ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
};

export default function () {
  // ── Health Check ───────────────────────────────────────────
  const healthRes = http.get(`${BASE_URL}/health`, { headers });
  check(healthRes, { "health OK": (r) => r.status === 200 });

  // ── User Flow: Estimate → Create Order → Track ─────────────
  const pickup = randomCoord();
  const dropoff = randomCoord();

  // 1. Price Estimate
  const estimatePayload = JSON.stringify({
    pickup_lat: pickup.lat,
    pickup_lng: pickup.lng,
    dropoff_lat: dropoff.lat,
    dropoff_lng: dropoff.lng,
    weight: 2.0,
    model: "on_demand",
  });

  const estimateRes = http.post(`${BASE_URL}/api/v1/pricing/estimate`, estimatePayload, {
    headers,
    tags: { name: "search" },
  });
  check(estimateRes, {
    "estimate OK": (r) => r.status === 200,
    "has estimate_id": (r) => r.json("estimate_id") !== undefined,
  });

  const estimateId = estimateRes.json("estimate_id");
  if (!estimateId) return;

  // 2. Create Order
  const orderPayload = JSON.stringify({
    estimate_id: estimateId,
    item_description: `Benchmark test package ${Date.now()}`,
  });

  const orderRes = http.post(`${BASE_URL}/api/v1/orders`, orderPayload, {
    headers,
    tags: { name: "order" },
  });
  check(orderRes, { "order created": (r) => r.status === 200 || r.status === 201 });

  const orderId = orderRes.json("id");
  if (!orderId) return;

  // 3. Get Order Detail
  const detailRes = http.get(`${BASE_URL}/api/v1/orders/${orderId}`, {
    headers,
    tags: { name: "detail" },
  });
  check(detailRes, { "detail OK": (r) => r.status === 200 });

  // 4. List Orders (authenticated)
  const listRes = http.get(`${BASE_URL}/api/v1/orders`, {
    headers,
    tags: { name: "list" },
  });
  check(listRes, { "list OK": (r) => r.status === 200 });

  // 5. Matching — search for courier (internal endpoint)
  const matchRes = http.post(`${BASE_URL}/api/v1/internal/orders/matching?id=${orderId}`, "", {
    headers,
    tags: { name: "search" },
  });
  check(matchRes, { "matching triggered": (r) => r.status === 200 });

  // ── Admin Endpoints ────────────────────────────────────────
  sleep(1);

  // Wallet balance check
  const walletRes = http.get(`${BASE_URL}/api/v1/wallet/balance`, {
    headers,
    tags: { name: "wallet" },
  });
  check(walletRes, { "wallet OK": (r) => r.status === 200 || r.status === 401 });
}

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    scenario: SCENARIO,
    base_url: BASE_URL,
    vus: VUS,
    duration: DURATION,
    metrics: {
      http_req_duration: {
        avg: data.metrics.http_req_duration.values.avg.toFixed(0) + "ms",
        p50: data.metrics.http_req_duration.values.med.toFixed(0) + "ms",
        p90: data.metrics.http_req_duration.values["p(90)"].toFixed(0) + "ms",
        p95: data.metrics.http_req_duration.values["p(95)"].toFixed(0) + "ms",
        p99: data.metrics.http_req_duration.values["p(99)"].toFixed(0) + "ms",
      },
      http_req_failed: (data.metrics.http_req_failed.values.rate * 100).toFixed(2) + "%",
      total_requests: data.metrics.http_reqs.values.count,
      total_failed: data.metrics.http_req_failed.values.passes + data.metrics.http_req_failed.values.fails,
    },
  };

  return {
    "stdout": JSON.stringify(summary, null, 2),
    "loadtest-summary.json": JSON.stringify(summary, null, 2),
  };
}
