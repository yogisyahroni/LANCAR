# Incident command runbook

Use this runbook for any P0/P1 incident affecting transaction truth,
availability, payment, provider callbacks, customer safety, or a critical SLO.

## Declare and assign

1. Create an incident record with `incident_id`, severity, detected timestamp,
   affected service/market, first correlation ID and current customer impact.
2. Assign, by role: Incident Commander (IC), technical lead, service owner,
   database owner, provider/finance owner when relevant, communications lead,
   support lead and scribe.
3. Link the active alert and the applicable runbook. Do not debug by changing
   production SQL or deleting event/idempotency rows.

## Timeline and communication

Record UTC timestamps for detection, acknowledgement, mitigation start, each
control/kill-switch change, recovery signal, reconciliation completion and
closure. The communications lead sends an update at least every 30 minutes or
when customer impact materially changes. Support receives a typed customer
message and a safe retry/recovery instruction.

## Control sequence

1. Preserve authoritative state; stop unsafe writes or rollout if an invariant
   or financial result is uncertain.
2. Reduce blast radius using gateway bulkheads, transactional load shedding,
   provider circuit breakers and documented feature kill switches.
3. Prefer queueing/replay and typed retryable errors over fake success.
4. Validate recovery with health, SLO and dependency signals, then run the
   domain-specific reconciliation checks before reopening traffic.

## Closure and postmortem

The IC closes only when impact is over, error budget status is recorded, and
order/payment/provider/queue data has been reconciled. The scribe opens a
postmortem within two business days containing:

- timeline, severity, owner and customer/market impact;
- detection and response gaps;
- contributing technical and process causes;
- corrective actions with named owners and due dates;
- rollback/chaos drill needed to prove remediation;
- explicit expiry for any accepted residual risk.

