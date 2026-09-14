# PART AG failure-drill tabletop — 2026-09-14

This is the executed local tabletop companion to
`failure-drill-record-2026-09-14.md`. The runner exercised all ten PART AG
failure contracts twice and wrote the raw JSON record to
`failure-drill-tabletop-2026-09-14.json`.

## Traceability

- Timestamp: `2026-09-14T12:22:42Z`–`2026-09-14T12:22:42Z`
- Repository revision under test: `b064ba6f5eeeffda94f1785b70f3319c0cf43ee7`
- Environment: local deterministic tabletop; no external provider was contacted
- Command: `python scripts/operations/run_failure_drill_matrix.py --reruns 2 --output docs/operations/failure-drill-tabletop-2026-09-14.json`
- Result: 10 scenarios × 2 runs, all contract assertions PASS

## Coverage and limitations

| Dependency | Tabletop result | Gap / owner / remediation date |
| --- | --- | --- |
| Payment provider | No transactional success on unknown provider failure; bounded circuit behavior | Live provider sandbox and callback reconciliation — Payments owner — before provider launch |
| Map/routing | Degraded route is explicit and non-authoritative for pricing | Provider/edge outage window — Geo/Platform owner — before next market promotion |
| Carrier API/webhook | Status becomes `UNKNOWN` and remains replayable | Carrier sandbox and signed replay — Logistics owner — before each carrier enablement |
| Redis/queue | Outbox remains durable/replayable; acknowledgement failure requeues | Staging broker/Redis failover — SRE/Platform owner — before multi-city promotion |
| Database | Stale transactional reads are rejected; writes stay fenced until approved promotion | Real replica restore and measured RPO/RTO — Database/SRE owner — before multi-region promotion |
| Notification | Domain commit is preserved; delivery is deferred without false success | FCM/provider outage with device evidence — Communication/Mobile owner — before push rollout |
| App Experience | New orders are gated while active orders are preserved | Multi-market rollback — Product/Ops owner — before each market promotion |
| Mobile release | Unsafe version policy gates new transactions while active-order/support access remains | Store percentage rollback and process-death proof — Mobile release owner — before percentage rollout |
| Safety/SOS | Incident persistence and honest fallback are preserved | Market emergency route approval — Safety/Ops owner — before market launch |
| Reconciliation | Mismatch is isolated; corrections are append-only compensating entries | Provider statement/bank reconciliation — Finance/Payments owner — before settlement close |

## Interpretation

The JSON record is executable tabletop evidence with timestamps, expected and
observed behavior, owner and remediation target for every required dependency.
It is not a claim of live payment, map, carrier, notification, broker,
replica, cloud-region, rollout or invoice behavior. The independently executed
staging safety/experience records remain linked from the affected rows.

The remaining release gate is to rerun the relevant rows in an approved
staging/provider or production-safe window after the listed material
remediation, then append the new timestamps and raw output.
