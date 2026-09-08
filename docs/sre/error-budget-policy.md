# LANCAR error-budget policy

Error budget is `1 - SLO target` over the rolling 30-day window. The budget
belongs to the service owner and is spent by real failed/slow authoritative
requests, provider errors, queue delay and data-loss-risk events according to
the SLO catalog.

## Release policy

| Remaining budget | Release posture | Required approval |
|---:|---|---|
| >50% | Normal release cadence; standard canary and rollback checks | Service owner |
| 25–50% | Only low-risk changes and reliability work; no unrelated blast-radius increase | Service owner + Platform SRE |
| 10–25% | Freeze feature releases for that service; reliability remediation and security fixes only | Incident commander + service owner |
| <10% or exhausted | Stop rollout, keep kill switches available, prioritize recovery and reconciliation | Incident commander + Product/Ops/Finance as affected |

An approved emergency/security fix may proceed while budget is exhausted only
when the change reduces current risk, has a named rollback owner, and has an
expiry/review time in the incident record. The approval is not a permanent
exception.

## Burn and review

- Fast burn: page immediately when a critical availability alert remains true
  for 10 minutes or a financial/provider invariant is at risk.
- Slow burn: review weekly per service, including budget spent, top routes,
  dependency errors, load-shed rate, queue age, DLQ count and reconciliation
  exceptions.
- The service owner records the remediation issue, owner and due date. The
  incident commander decides whether release resumes after the SLI recovers;
  recovery alone is insufficient if a data or financial reconciliation gap
  remains.

## Non-negotiable safeguards

- Error-budget policy never authorizes bypassing authorization, idempotency,
  server pricing, payment verification, ledger invariants or provider status
  mapping.
- Planned maintenance is annotated in monitoring and does not erase evidence.
- Budget calculations and incident artifacts contain aggregate metrics only;
  secrets and user/provider payloads stay out of dashboards and evidence.

