# Market launch control room — PART AG

The launch view must expose order creation/completion, payment intent state and
provider health, match/no-supply, merchant acceptance, ETA, provider/carrier
callbacks, cancellation/refund, support cases, safety P0/P1, reconciliation,
crash/ANR, and communication delivery. Each view names an owner, threshold,
runbook, and kill switch. A threshold breach opens an incident and stops the
relevant rollout; it does not silently hide the signal.

Market launch is staged by demand tier and percentage. Guardrails include
payment double-success, order loss, no-supply, callback lag, safety SLA,
refund/reconciliation difference, crash/ANR, and support contact rate. After
launch, the owner records a timestamped retro and action due dates.

## Staging control-room roster — 2026-09-14

| Function | Launch-day owner role | Pause / rollback trigger | Runbook / control |
|---|---|---|---|
| Product | Product release owner | Conversion or complaint guardrail breach | `docs/release/production-readiness-review.md` |
| Operations | Market launch lead | No-supply, SLA, or callback-lag breach | `docs/sre/service-catalog.md` and market controls |
| Engineering | Platform on-call | 5xx, queue lag, order loss, or payment-integrity breach | `docs/operations/failure-drill-register.md` |
| Finance | Payments/Finance on-call | Reconciliation difference or double-compensation signal | Payment reconciliation exception queue |
| Support | Customer Communications on-call | Contact-rate or unresolved P0/P1 breach | `docs/contracts/support-cases-2026.md` |
| Safety | Safety incident commander | Safety SLA breach or unacknowledged P0 | Safety Operations and failure-drill register |

Operations and Engineering own the market kill switch and rollback execution;
Finance owns the payment/reconciliation stop decision. Thresholds use
server-authoritative order, payment, safety, and communication metrics. This is
a staging operating model; no production launch or retrospective is claimed.

## Staging pause thresholds

These thresholds are the operational meaning of a breach in the roster above;
they are sourced from the SLO catalog and the Safety policy rather than from a
client-side success signal.

| Signal | Pause / escalation threshold | Owner |
|---|---|---|
| Critical HTTP availability | `<99.5%` for 10 minutes | Platform on-call |
| Critical HTTP latency | p95 `>750ms` for 10 minutes | Platform on-call |
| Order writes | 5xx/load-shed spike or `<99.9%` for 10 minutes | Fulfillment/Transaction on-call |
| Payment callbacks | Any unexplained verified-callback failure or reconciliation lag | Payments/Finance on-call |
| Queue delivery | Queue age `>10m` or DLQ growth | Messaging/Data owner |
| Safety incident | HIGH not acknowledged within 5 minutes; CRITICAL not acknowledged within 1 minute | Safety incident commander |

On breach, the named owner pauses the affected rollout/capability, records the
incident and escalates through the relevant runbook. Recovery requires the SLI
to return within threshold plus replay/reconciliation checks; a runbook alone
is not treated as drill evidence.
