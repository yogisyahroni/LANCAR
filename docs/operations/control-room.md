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
