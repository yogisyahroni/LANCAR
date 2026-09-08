# LANCAR SLI/SLO and alert catalog

Prometheus recording rules live in `observability/slo.yaml`; operational
thresholds in `deploy/observability/prometheus-rules.yaml` complement them.
The rules are based on server-side request metrics and queue/provider metrics,
not client-reported success.

## Service SLOs

| SLO | SLI | Target | Page / action threshold |
|---|---|---:|---|
| Critical HTTP availability | successful 2xx/3xx requests divided by all HTTP requests, grouped by `service_name` | 99.5% rolling 30d | `<99.5%` for 10m: stop rollout, page owner |
| Critical HTTP latency | p95 of `tembus_http_server_request_duration_seconds`, grouped by service | <=750ms | `>750ms` for 10m: investigate saturation/dependency |
| Order write | successful authoritative order mutations / all order mutations | 99.9% rolling 30d | 5xx/load-shed spike or `<99.9%` for 10m: stop order release |
| Payment callback | accepted, verified, idempotently persisted callbacks / received callbacks | 99.95% rolling 30d | any unexplained callback failure or reconciliation lag: page Finance |
| Provider request | successful adapter calls / eligible calls, excluding typed client rejection | >=99.5% | circuit open immediately; retry budget exhaustion pages Provider Ops |
| Queue delivery | acknowledged messages / delivered messages after durable handling | >=99% | queue age >10m or DLQ growth: page Messaging/Data owner |
| WebSocket state sync | authenticated connections receiving authoritative state without server error | >=99% | auth/close/error spike for 10m: page Platform |

## Guardrails and labels

- Breaker state, retry attempts, bulkhead rejection, load-shed response,
  queue age, DLQ depth, database pool saturation, provider error class and
  reconciliation lag are guardrails. Conversion cannot mask a failed
  transaction or provider callback.
- Never put customer IDs, phone numbers, addresses, coordinates, tokens,
  signatures, payment payloads or raw provider payloads in metric labels.
- `service_name`, route family, operation, status class, provider code and
  market code are the maximum useful dimensions; high-cardinality values stay
  in redacted logs with correlation IDs.

## Alert response

1. Confirm the alert window and affected service/market.
2. Check `X-Correlation-ID`/trace links and the dependency row in the service
   catalog.
3. Stop risky rollout or activate the documented kill switch when the error
   budget burn is real.
4. Use the relevant outage runbook; record timeline and customer impact.
5. Close only after the SLI recovers and replay/reconciliation checks pass.

