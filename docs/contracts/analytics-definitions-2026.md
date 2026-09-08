# Canonical analytics definitions — 2026

Contract version: `2026-09-08`  
Source of truth: the governed canonical event stream, not ad-hoc queries of
production transactional tables.

| Metric | Definition | Numerator/fact | Denominator | Deduplication |
| --- | --- | --- | --- | --- |
| GMV | Gross customer order value for completed orders before refunds | `order.completed.order_total_minor` | completed order event | unique `event_id`/`dedupe_key` |
| Completed order | Unique order with an authoritative completed event | `order.completed` | none | one terminal event per order |
| Cancellation rate | Cancelled orders divided by created orders in the same cohort window | `order.cancelled` before completion | `order.created` | unique order/entity |
| Refund rate | Orders with a completed refund divided by completed orders | `refund.created` with `status=completed` | `order.completed` | unique refund and order |
| Active courier | Distinct courier entities whose latest activity interval is active | `courier.active` minus `courier.inactive` | none | latest interval, stale window excluded |
| Active merchant | Distinct merchant entities whose latest operating interval is active | `merchant.active` minus `merchant.inactive` | none | latest state version, stale window excluded |
| SLA compliance | Eligible service measurements met at or before the market deadline | `sla.measured` with `met=true` | `sla.measured` with `eligible=true` | unique measurement/entity |

## Governance

The definitions are mirrored in the datalake worker contract and served to the
admin analytics page from `/api/v1/admin/analytics/definitions`. Experiment
assignments and ML feature jobs consume the canonical stream/spool and these
definitions. A production-table query is not a substitute because it can
double-count retries, bypass event time, and disagree with cross-service state.

