# Regional failover runbook

This procedure protects authoritative order/payment/payout/provider state
during a regional outage. It assumes the region contract in
`infra/regions/region-catalog.yaml` and the existing append-only/idempotency
primitives. Do not fail over by changing DNS alone.

## Preconditions

- Incident commander, database owner, payments owner, provider owner, and
  communications owner are assigned.
- The candidate region has matching migration/schema and policy versions.
- Replication watermark and measured lag are recorded.
- The old primary is fenced from transactional writes, or its network/storage
  lease is demonstrably revoked.
- The candidate has no unresolved ledger, order transition, outbox, carrier
  inbox, or AWB uniqueness violation.
- Operator approval and a correlation ID are recorded in the control plane.

## Execute

1. Confirm three consecutive failed `/health` probes or an equivalent incident
   signal; stop edge traffic to the unhealthy region.
2. Reject new transactional writes while fencing the old primary. Preserve
   idempotency keys and return a typed retryable region-unavailable error.
3. Verify the candidate's RPO watermark against the domain-specific target.
   Do not promote a candidate that would lose acknowledged financial state.
4. Promote exactly one candidate and enable its transactional readiness only
   after approval. Keep all other regions read-only/standby.
5. Update edge routing to the effective primary. Keep non-critical projections
   explicitly marked degraded until their freshness target is met.
6. Replay the event outbox by aggregate ordering key. Consumers must dedupe by
   source-region/event ID and operation key before any external mutation.
7. Run authenticated smoke for order creation, payment state, payout ledger,
   AWB handoff, carrier event ingestion, notification queueing, and safe
   rejection while the old primary is unavailable.
8. Compare pre/post counts and unique keys for orders, payments, payouts,
   AWB attempts/handoffs, carrier events, and ledger entries.
9. Record detection time, write fence time, promotion time, first successful
   safe transaction, observed RPO/RTO, degraded features, duplicate events
   suppressed, and follow-up owners.

## Recovery and rollback

Keep the former primary fenced until it is rebuilt or explicitly rejoined as a
standby. Never route writes to both regions. If promotion validation fails,
keep transactional writes closed and restore from the last validated
watermark; do not manufacture a success response. Any compensating payment,
payout, AWB, or carrier action must use its existing idempotency/provider-event
key and be reconciled before closure.

## Local proof

Run from the repository root:

```text
python scripts/region_failover_drill.py --validate
python scripts/region_failover_drill.py --drill
```

The output is a deterministic logic/audit result. It is not a substitute for
an actual cloud-region outage, provider sandbox, or production RTO measurement;
those are release/SRE evidence and must be recorded separately.
