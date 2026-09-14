# Executed failure-drill record — 2026-09-14

This record covers the safety/experience slice that was executable against the
current staging deployment. It is evidence for the corresponding portion of
PART X and PART AG only; it does not claim that the payment, maps, carrier,
Redis/queue, database, notification or reconciliation drills are complete.

## Environment and traceability

- Environment: staging, public API `https://api.bawain.my.id`
- Customer web origin used by the drills: `https://app.bawain.my.id`
- Repository HEAD: `fcce455f6e6cb5cd9363fbfdf54887e3efeae7e1`
- Admin image rebuilt from the current worktree: `sha256:e974281cdf2ced85d001ebb2fe39e4b0e2608878c63cd94c8cd717571238884d`
- Sensitive values: staging database URL, JWT secret, session tokens and internal keys were supplied through environment variables and are intentionally absent from this record.

## Drill 1 — safety incident, fallback, authorization and Ops SLA

- Timestamp: `2026-09-14T07:07:07Z`–`2026-09-14T07:07:10Z`
- Failure/condition injected: active Towing emergency report, active Paket unsafe-location report, unavailable SOS provider policy, and unauthorized evidence read.
- Expected safe behavior: persist the safety incident independently of order state; expose honest fallback instructions; deny sensitive evidence to a customer role; show a critical Ops queue item with SLA.
- Observed behavior: Towing incident HTTP 201 (`recorded`), safety-center HTTP 200 with fallback policy, Paket incident HTTP 201, SOS HTTP 201 with `fallback_instructions`, Ops queue HTTP 200 with critical incident and `sla_due_at`, unauthorized evidence HTTP 403; three incidents persisted, two critical.
- Idempotency/recovery: the repeatable staging script completed and removed its temporary orders/incidents in `finally`.
- Gap: market-specific emergency provider/call-center configuration is not present; fallback is the only honest behavior currently proven.
- Owner/remediation due: Safety/Ops owner — configure and approve the market-specific emergency route before enabling a live-response claim; due before market launch.
- Rerun: this same drill was rerun in the same window and produced the same HTTP/persistence assertions.

## Drill 2 — controlled new-order kill switch

- Timestamp: `2026-09-14T07:07:18Z`–`2026-09-14T07:07:20Z`
- Failure injected: temporary Experience control-plane gate for `tembus_instant` with `preserve_active_orders=true`.
- Expected safe behavior: reject only new orders with an explicit controlled error and preserve active-order recovery.
- Observed behavior: HTTP 503, code `NEW_ORDER_GATE_ACTIVE`, `active_orders_preserved=true`.
- Idempotency/recovery: temporary feature-flag row count after cleanup was `0`.
- Gap: this proves one staging kill-switch path, not a full bad-release or multi-market rollback rehearsal.
- Owner/remediation due: Platform/Ops owner — add the drill to the pre-launch runbook and repeat after any material flag/deployment change; due before each market promotion.
- Rerun: PASS in this execution window.

## Drill 3 — socket/network reconnect

- Timestamp: `2026-09-14T07:07:19Z`–`2026-09-14T07:07:21Z`
- Failure injected: aborted Engine.IO polling request between two authenticated socket connections.
- Expected safe behavior: reconnect without losing authoritative safety state; REST read remains the source of truth.
- Observed behavior: first socket connected, network drop simulated, second socket connected, safety snapshot HTTP 200, incident present after reconnect.
- Idempotency/recovery: temporary order and incident were removed in cleanup; no state mutation was queued by the simulated drop.
- Gap: this is a controlled polling reconnect, not a physical-device radio switch or full mobile process-death test.
- Owner/remediation due: Mobile/Platform owner — run the same assertion on representative mobile tiers and process-death scenarios; due before mobile percentage rollout.
- Rerun: PASS in this execution window.

## PART AG assessment

The executed records now satisfy timestamped evidence, observed behavior,
gaps, owners and remediation dates for this safety/experience slice. The
global REALITY-2026-008 checklist remains unchecked because the required
payment, map, carrier, Redis/queue, database, notification, bad mobile
release and reconciliation drills still need their own risk-appropriate
staging/tabletop/production-safe evidence and reruns.
