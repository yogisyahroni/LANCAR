# Staging capacity evidence — 2026-09-14

This is a bounded staging observation, not a production-capacity approval.
The workload was directed to the canonical API host `https://api.bawain.my.id`
using an authenticated staging customer session. Session material was supplied
through the shell and is not recorded here.

## Executed profiles

| Profile | Requests | Target / actual QPS | Success | p95 |
|---|---:|---:|---:|---:|
| One-city search | 100 | 25 / 24.34 | 100/100 | 297.6 ms |
| Multi-city search proxy | 200 | 50 / 48.85 | 200/200 | 315.9 ms |

Command: `node scripts/search/search-reliability-smoke.mjs` with
`PROFILE=city`, then `PROFILE=multi_city`, bounded request counts, concurrency
10/20 and `SEARCH_URL=https://api.bawain.my.id`.

The payment callback rehearsal is recorded separately in
`docs/task-evidence/PAYPLAT-2026-010.md`: 5 VUs for 30 seconds, 2,692/2,692
checks, 0% request failures and 9.67 ms p95, using one disposable intent and
replayed callback identity. It is not a peak create-order test.

## Resource snapshot after the bounded observation

- Database: 78 MB, 25 active sessions, `max_connections=100` at capture time.
- Gateway: 0.70% CPU, 87.34 MiB memory.
- Search service: 0.00% CPU, 18.32 MiB memory.
- Payment service: 0.00% CPU, 15.55 MiB memory.
- Admin service: 0.61% CPU, 84.2 MiB memory.
- Redis: 0.37% CPU, 14.93 MiB memory.
- RabbitMQ: 0.60% CPU, 122.3 MiB memory.
- Database: 0.12% CPU, 247.5 MiB memory.

These are Docker host snapshots after the run, not a sustained saturation
measurement and not a cost estimate.

## Capacity decision

The bounded search profiles completed without HTTP errors and provide a useful
staging baseline. They do not satisfy the full REALITY-2026-006 gate because
there is no approved next-stage demand forecast, sustained order-create/load
window, provider quota result, queue/Redis saturation result, storage-growth
trend, or cost-per-usage-unit measurement. Those gaps remain release follow-up
items with Platform/SRE and Finance owners before stage promotion.
