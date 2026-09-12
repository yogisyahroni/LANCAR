# Failure drill register — PART AG

Required drills and evidence owners:

| Dependency | Expected safe behavior | Evidence |
|---|---|---|
| Payment provider | disable new attempts, keep callbacks/reconciliation, no blind second charge | payment router tests + provider sandbox |
| Map/routing | retain last known safe route/ETA and explicit degraded UI | routing runbook |
| Carrier/Redis/DB | retry boundedly, preserve idempotency, queue exception, page owner | integration/drill record |
| Notification | preserve in-app/order state and retry/backoff; no false delivered claim | communication delivery tests |
| Mobile/offline | retain active state, queue only idempotent mutation, recover after reconnect | mobile device matrix |
| Safety/SOS | persist P0 incident and show honest local fallback | safety controller tests |
| Reconciliation | isolate mismatch, compensating entry only, no manual provider rewrite | finance reconciliation record |

Each execution must record timestamp, commit/environment, injected failure,
observed behavior, gap, owner, due date, and rerun result. A runbook document
without an executed drill is not a passing drill.
