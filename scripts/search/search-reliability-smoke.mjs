#!/usr/bin/env node

// Bounded staging profile for SEARCH-2026-009. The profiles represent the
// expected query rate for one active city and a small multi-city rollout; they
// are intentionally configurable and are not a production capacity claim.
const profiles = {
  city: { targetQps: 25, requests: 100 },
  multi_city: { targetQps: 50, requests: 200 },
};

const profileName = process.env.PROFILE || 'city';
const profile = profiles[profileName];
if (!profile) throw new Error(`Unknown PROFILE: ${profileName}`);

const baseUrl = (process.env.SEARCH_URL || 'http://localhost:8092').replace(/\/$/, '');
const authCookie = process.env.AUTH_COOKIE || '';
const requests = Number(process.env.REQUESTS || profile.requests);
const targetQps = Number(process.env.TARGET_QPS || profile.targetQps);
const concurrency = Math.max(1, Number(process.env.CONCURRENCY || 10));
if (!authCookie) throw new Error('AUTH_COOKIE is required for the staging smoke');
if (!Number.isFinite(requests) || requests < 1 || !Number.isFinite(targetQps) || targetQps <= 0) throw new Error('REQUESTS and TARGET_QPS must be positive numbers');

const queries = ['ayam geprk', 'ban bocor', 'towing mobil', 'kirim paket bandung'];
const intervalMs = 1000 / targetQps;
const started = performance.now();
let nextDue = started;
let cursor = 0;
const results = [];

async function one() {
  const due = nextDue;
  nextDue += intervalMs;
  const wait = due - performance.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  const query = queries[cursor++ % queries.length];
  const t0 = performance.now();
  try {
    const response = await fetch(`${baseUrl}/api/v1/search?q=${encodeURIComponent(query)}&market_code=id-jk&locale=id-ID`, {
      headers: { Cookie: authCookie },
    });
    results.push({ status: response.status, latency: performance.now() - t0 });
  } catch (error) {
    results.push({ status: 0, latency: performance.now() - t0, error: String(error) });
  }
}

async function worker() {
  while (true) {
    // The cursor is the only allocation gate; reserve one request atomically
    // before awaiting so workers cannot overshoot the configured profile.
    if (worker.claimed >= requests) return;
    worker.claimed += 1;
    await one();
  }
}
worker.claimed = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, worker));

const elapsedSeconds = (performance.now() - started) / 1000;
const ok = results.filter(item => item.status >= 200 && item.status < 300);
const errors = results.filter(item => item.status < 200 || item.status >= 300);
const latencies = results.map(item => item.latency).sort((a, b) => a - b);
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] || 0;
const actualQps = results.length / elapsedSeconds;

console.log(JSON.stringify({
  profile: profileName,
  target_qps: targetQps,
  requests: results.length,
  concurrency,
  actual_qps: Number(actualQps.toFixed(2)),
  success_count: ok.length,
  error_count: errors.length,
  p95_ms: Number(percentile(0.95).toFixed(1)),
}));

if (results.length !== requests || errors.length > 0) process.exitCode = 1;
