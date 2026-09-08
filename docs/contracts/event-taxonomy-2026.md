# Canonical event taxonomy — 2026

Contract version: `2026-09-08`  
Owner: platform data boundary (the existing `event_outbox` and `datalake-worker`)

## Canonical envelope

Every event delivered to `tembus.events` and consumed by analytics/ML uses one
top-level envelope. `event_id` is the durable `event_outbox.id`; `data` contains
the event-specific payload.

```json
{
  "event_id": "uuid",
  "event_type": "order.completed",
  "schema_version": 1,
  "occurred_at": "2026-09-08T10:00:00Z",
  "produced_at": "2026-09-08T10:00:01Z",
  "market": "id-jk",
  "service": "order-service",
  "actor_pseudonymous_id": "actor_<stable-hmac>",
  "entity_id": "order-id",
  "correlation_id": "request-or-workflow-id",
  "trace_id": "trace-id",
  "pii_classification": "restricted",
  "field_pii_classification": { "payload": "restricted" },
  "retention_class": "standard",
  "dedupe_key": "sha256-of-logical-event",
  "data": {}
}
```

The legacy `id`, `event_version`, and `payload` aliases are emitted only during
the migration window. New consumers must use the canonical names.

## Registered event schemas

| Event type | Version | Required data | Analytics use |
| --- | ---: | --- | --- |
| `order.created` | 1 | order/entity and market | cancellation denominator |
| `order.completed` | 1 | order total in minor units, currency | GMV and completed orders |
| `order.cancelled` | 1 | order and cancellation reason code | cancellation numerator |
| `payment.paid` | 1 | payment/order, amount and currency | payment reconciliation |
| `payment.refunded` | 1 | payment/order, refunded amount and currency | refund facts |
| `refund.created` | 1 | refund/order, status and amount | refund rate |
| `courier.active` / `courier.inactive` | 1 | pseudonymous courier entity and interval | active courier |
| `merchant.active` / `merchant.inactive` | 1 | merchant entity and interval | active merchant |
| `sla.measured` | 1 | eligible, met, deadline and service | SLA compliance |
| `merchant.catalog.changed` | 1 | merchant entity and catalog version | governed merchant facts |
| `merchant.operating_state.changed` | 1 | merchant entity and state version | active merchant projection |
| `model.unavailable.shown` | 1 | model and coarse route distance | product availability analysis |
| `dispatch.decision` | 1 | candidate hash, score breakdown, ETA, model/rule version and fallback state | dispatch audit and experiment analysis |

An event schema change increments `schema_version`. Version 1 consumers must
continue to parse additive changes; removals or semantic changes require a new
version and a compatibility test in `datalake-worker/internal/service`.

## Delivery and replay rules

- Producers persist the event in the existing outbox in the same transaction as
  the business mutation.
- The publisher uses `event_id` as RabbitMQ `messageId` and includes
  `dedupe_key` in the envelope and message headers.
- The datalake consumer validates the envelope before acknowledging it.
  Invalid events are dead-lettered; landing failures are requeued.
- The append-only event spool retains the canonical event identity. Redelivery
  of the same dedupe identity is acknowledged without a second append.
- Redis UI notifications and ad-hoc service logs are not analytics sources.
