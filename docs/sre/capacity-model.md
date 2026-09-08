# LANCAR capacity model

This model separates planning inputs from measured production capacity. The
initial validation profile is aligned with `scripts/load/on-demand-1m-day.k6.js`
and is a staging/load-test target, not a claim about current production
traffic.

## Critical-path profile

| Flow | Initial profile | Primary bottleneck | Protection |
|---|---:|---|---|
| Quote / route calculation | 250 requests/s | routing provider quota, route cache, read DB | public rate limit, provider breaker, bounded upstream bulkhead |
| Order create | 25 requests/s | PostgreSQL writer, idempotency lock, matching queue | gateway bulkhead + order-service transactional load shedder + idempotency |
| Courier tracking | 100 requests/s | Redis/socket fanout and write amplification | per-user/IP limits, socket bulkhead, sampling/aggregation |
| Socket state sync | 25 concurrent VUs initially | gateway connections and Redis adapter | bounded WebSocket bulkhead, auth-fail alert, reconnect backoff |
| Payment callback | 5 requests/s | payment DB transaction and provider reconciliation | signature verification, idempotency, bounded writes, reconciliation queue |
| Provider webhook | configurable `PROVIDER_WEBHOOK_RPS` (next-stage measured peak + 50% headroom) | inbox uniqueness, adapter/provider quota | per-provider breaker, retry budget, durable inbox and `UNKNOWN` mapping |

The next-stage forecast must be recorded before promotion:

```text
peak_rps = max(observed_p95_peak * growth_factor, launch_commitment_rps)
test_rps = peak_rps * 1.5 safety_margin
```

When no production observation exists, `launch_commitment_rps` must be a
written product/ops assumption and the result must be labeled unmeasured. Do
not replace it with an arbitrary impressive number.

## Resource checks

For each profile, record:

- PostgreSQL writer/read pool saturation, lock wait, CPU, IOPS, storage growth
  and replication lag;
- Redis command latency, memory/eviction, connection count and pub/sub fanout;
- RabbitMQ publish confirm latency, ready/unacked depth, consumer rate and
  DLQ growth;
- provider quota, timeout, retry count, breaker state and vendor rate limit;
- gateway CPU/memory, active bulkhead slots, load-shed count and socket count;
- object storage event landing latency and spool/DLQ growth.

Capacity is accepted only when the bottleneck, cost implication, failure
behavior and tested headroom are written down. A pass/fail number without
those facts is not a capacity result.

