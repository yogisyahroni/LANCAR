# Database failover and restore runbook

This runbook protects order, payment, payout, idempotency, outbox and provider
inbox truth. It complements `docs/runbooks/region-failover.md`.

## Preconditions

- IC, Database, Transaction, Payments/Finance and Communications owners are
  assigned with a correlation/incident ID.
- Candidate primary has the required schema/migration version, backup restore
  point and measured replication watermark.
- The old writer is fenced; dual-primary writes are prohibited.
- Counts, uniqueness constraints, outbox/idempotency and ledger checks have a
  recorded baseline.

## Execute

1. Stop or reject new transactional writes with a typed retryable error while
   the writer is fenced. Keep health/readiness truthful.
2. Validate RPO against domain targets; do not promote a replica that can lose
   acknowledged financial state.
3. Promote exactly one candidate, verify writer/read routing, pool limits and
   migrations, then run authenticated smoke for order/payment/outbox/webhook.
4. Replay outbox/inbox work by ordering key with consumer idempotency. Do not
   delete duplicates to make counts match.
5. Compare pre/post counts and unique keys for orders, payments, refunds,
   payouts, ledger, idempotency, outbox, carrier inbox and notification work.

## Rollback and restore

Keep the former primary fenced until rebuilt and validated as standby. If
promotion checks fail, keep transactional writes closed and restore from the
last validated point; never return a success for an uncommitted operation.
Record RPO/RTO, rejected writes, replayed/deduped events, reconciliation
mismatches and owners in the incident timeline.

