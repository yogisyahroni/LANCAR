# LANCAR multi-region, residency and recovery architecture — 2026

## Decision

LANCAR uses market-home-region affinity with one effective transactional
primary per market. The existing service ownership remains authoritative:
order-service owns order state, payment-service owns payment/wallet state,
admin-service owns market configuration and operational control, and the
integration gateway owns provider/carrier state. A new routing layer does not
become a second order, payment, or provider source of truth.

The machine-readable contract is
[`infra/regions/region-catalog.yaml`](../../infra/regions/region-catalog.yaml).
The implementation and deterministic drill are
[`region_failover_drill.py`](../../scripts/region_failover_drill.py).

## Region affinity and residency

| Domain | Affinity | Cross-region data | Resident data | RPO | RTO |
| --- | --- | --- | --- | ---: | ---: |
| Identity/KYC/consent | User home region | Pseudonymous status/version only | Contact, verification artifacts, consent context | 5m | 30m |
| Market configuration | Global control plane | Approved public projection/version | Internal approval/audit details | 5m | 30m |
| Orders | Market home region | ID, market, version, correlation | Addresses, contact, payload | 0m | 60m |
| Payments | Market home region | ID, order, version, provider event ID | Provider payload and financial context | 0m | 60m |
| Payouts | Market home region | ID, order, version, provider reference | Beneficiary and provider details | 0m | 120m |
| Provider mutations | Provider home region | Event ID, provider code, AWB hash, version | Credentials/native payload | 5m | 60m |
| Event outbox | Source region | Ordered event metadata | Event payload | 1m | 30m |
| Public catalog | Market home region | Approved read-only projection | None beyond source market data | 15m | 60m |
| Observability | Global redacted telemetry | Redacted metrics/logs/traces | Raw sensitive payloads | 15m | 30m |

`RPO=0` means the transactional commit is not acknowledged until the
configured synchronous replication/consistency condition is met. It does not
mean the current single-VPS deployment already provides that guarantee; the
promotion gate must reject a configuration that cannot meet it.

## Routing and safe degradation

The edge uses `/health` for process/dependency health and `/ready` for
transactional readiness. Health alone never grants write eligibility. When a
primary is unhealthy:

- order, payment, payout, identity and provider mutation writes are rejected
  with a typed region-unavailable result and retain their idempotency key;
- transactional reads move only to an explicitly promoted region after a
  write fence and watermark check;
- non-critical projections may be served read-only from a healthy standby with
  a bounded-staleness label;
- notifications stay queued in the outbox and are replayed; no client success
  is reported without provider acknowledgement;
- analytics/support views may be stale or degraded, but cannot mutate order or
  financial state.

This prevents a stale secondary from creating a second order, payment,
payout, AWB, or carrier mutation.

## Queue and event semantics

The existing `event_outbox`, `api_idempotency_keys`, order transition
idempotency index, carrier event inbox, and AWB uniqueness constraints are the
recovery primitives. Replication carries event identity and ordering metadata;
consumers persist a dedupe key before applying a side effect. Replay is
allowed, duplicate delivery is expected, and side effects are applied once by
operation key/provider event ID. Events that exceed the retry budget go to a
dead-letter state for audited operator recovery.

## Recovery sequence

1. Edge health probes cross the failure threshold and remove the region from
   eligible traffic.
2. Operations freeze writes and capture the old-primary fencing token and
   replication watermark.
3. The control plane checks the candidate region's schema, watermark,
   idempotency store, outbox, payment ledger, payout, AWB, and carrier inbox
   invariants.
4. An approved operator promotes one candidate and records the promotion
   decision/correlation ID.
5. Edge routes transactional traffic to the promoted primary only; read-only
   features are explicitly degraded until their projection is current.
6. Outbox events replay in aggregate order. Duplicate events are acknowledged
   without repeating an external mutation.
7. Smoke tests verify one order/payment/payout/AWB/carrier mutation per
   operation key, then the incident record is closed with measured RPO/RTO.

The full operator procedure is in
[`docs/runbooks/region-failover.md`](../runbooks/region-failover.md), and
residency launch checks are in
[`docs/runbooks/data-residency.md`](../runbooks/data-residency.md).

## Proof boundary

`python scripts/region_failover_drill.py --validate` proves catalog
consistency. `python scripts/region_failover_drill.py --drill` measures and
audits deterministic outage/promotion/replay behavior. These commands do not
prove cloud-provider health checks, cross-region database replication,
third-party provider behavior, or a production RTO; those require the staging
environment and are recorded as release/SRE follow-up.
