# LANCAR service catalog and dependency ownership

This is the operational ownership map for the critical request and event
paths. Ownership is expressed as an on-call role so the catalog remains valid
when people or vendors change. A release may not promote a critical change
without the owning role and the incident commander being assigned.

## Critical services

| Component | Source of truth / storage owner | Operational owner | Dependencies | SLI, SLO, alert threshold | Dependent surfaces |
|---|---|---|---|---|---|
| `api-gateway` :8080 | Edge routing and proxy policy; no domain state | Platform SRE | Auth, order, payment, merchant, routing, Redis | Availability 99.5%; p95 <=750ms; critical after 10m below target | Customer web/mobile, merchant web, admin web |
| `auth-service` :8081 | Identity/session tables in PostgreSQL | Identity/Security on-call | PostgreSQL writer/reader, Redis, RabbitMQ | Login/token availability 99.9%; p95 <=500ms; page Identity on 5m error burn | All authenticated clients and services |
| `routing-service` :8082 | Canonical route snapshot and map-provider boundary | Geo/Platform on-call | PostgreSQL, Redis, TomTom/OSRM provider | Route response availability 99.5%; p95 <=1.5s; provider failure alert >10/min | Quote, matching, tracking, admin route views |
| `order-service` :8083 | Orders, state transitions, idempotency, outbox and settlement references in PostgreSQL | Fulfillment/Transaction on-call | PostgreSQL writer/reader, Redis, RabbitMQ, routing, payment, integration, notification | Order-write availability 99.9%; p95 <=1.2s; load-shed and 5xx alert | Customer, courier, merchant, payment, support |
| `payment-service` :8084 | Wallet/ledger/payment records in PostgreSQL | Payments/Finance on-call | PostgreSQL, Redis, Midtrans/Xendit | Callback processing 99.95%; p95 <=1s; any unexplained callback error pages Finance | Customer checkout, order state, payout/settlement |
| `integration-gateway` :8085 | Provider adapter state, inbox and provider-native references | Provider Operations on-call | Logistics, maps, OTP/payment providers, PostgreSQL | Provider call success >=99.5%; circuit-open alert immediately; unknown status is never success | Order, tracking, merchant and notification flows |
| `merchant-service` :8085 (internal profile) | Merchant/branch/menu/catalog tables in PostgreSQL | Commerce Operations on-call | PostgreSQL, order, integration, notification | Catalog/acceptance availability 99.5%; p95 <=1.5s; 10m burn | Merchant portal, customer browse, order readiness |
| `admin-service` :3000 | Admin/audit records and operational read models | Operations Tooling on-call | PostgreSQL, Redis, payment, order, RabbitMQ | Admin mutation availability 99.5%; p95 <=2s; 10m burn | Admin dashboard, support, finance, launch control room |
| `datalake-worker` | Validated canonical events in object storage | Data Platform on-call | RabbitMQ, object storage/R2 | Event landing success >=99%; queue age <10m; DLQ alert immediately | Analytics, experimentation, ML feature consumers |

Ports are the local/container contracts; deployment-specific routing may put
multiple services behind the gateway. `merchant-service` and the internal
integration profile must retain distinct service identity even when they share
an address in a development compose file.

## Shared dependency ownership

| Dependency | Owner | Failure policy |
|---|---|---|
| PostgreSQL writer | Database on-call | Fence writes on failover; never acknowledge a transaction without durable commit |
| PostgreSQL read replica | Database on-call | Route safe reads to writer or return typed unavailable; never use stale state for authorization or financial truth |
| Redis | Platform SRE | Gateway/store limits use bounded local protection when Redis is unavailable; do not turn Redis failure into unbounded write concurrency |
| RabbitMQ | Messaging on-call | Persistent publish, bounded consumer prefetch, retry/requeue or DLQ; acknowledge only after durable handling |
| Maps provider | Geo/Provider on-call | Circuit breaker and labeled approximate fallback only for non-price route display; no fabricated provider tariff/ETA |
| Payment provider | Payments/Finance on-call | Fail closed for payment success; idempotent retry/reconciliation; no order success from a missing callback |
| Logistics carrier | Provider Operations on-call | Adapter-owned retry/circuit breaker; preserve native status; unknown status remains `UNKNOWN` |
| Notification provider | Customer Communications on-call | Commit domain transaction independently, enqueue durable notification work, retry/DLQ delivery |

## Ownership rules

1. The service owning authoritative state owns its invariant and rollback. A
   proxy, cache, socket, or client may not become a second source of truth.
2. Every alert routes to the operational owner above and includes a
   correlation/request ID, service, dependency, severity and runbook link.
3. A service owner must review SLO/error-budget status before a release that
   changes its critical path. Unassigned ownership is a release blocker.

