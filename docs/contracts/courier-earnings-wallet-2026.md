# Courier earnings, wallet and payout contract (2026)

## Ownership

- `order_legs` owns server-verified per-job earning facts and the policy
  snapshot used to calculate them.
- `courier_earnings_ledger` is the append-only payout ledger for courier
  earnings and payout debits. A settled earning breakdown is never rewritten;
  a correction is a new `source = 'adjustment'` ledger entry.
- `payment-service` remains the mutation authority for the isolated wallet
  tables and withdrawal transaction flow. Its existing `hold_balance` and
  optimistic-locking rules remain in force. The admin courier earnings API
  exposes the courier payout ledger's state buckets below.

## Wallet state buckets

The courier API returns these explicit IDR fields:

- `available_balance_idr`: withdrawable available credits, less requested,
  processing and paid payout debits, excluding open-dispute credits.
- `pending_balance_idr`: withdrawable credits awaiting release plus payout
  debits currently requested or processing.
- `held_balance_idr`: held credits and any explicitly promotional or
  non-withdrawable credits.
- `withdrawn_balance_idr`: cumulative gross payout amount whose request is
  `paid`.

The database normalizes a credit carrying `withdrawable = false`,
`non_withdrawable = true`, or a promotional/held `balance_bucket` into
`settlement_status = 'held'`. Therefore a client cannot make promotional
balance withdrawable by submitting an `available` status.

## Statement categories

The earnings ledger response provides `statement_category` per row and the
following summary totals: `order_earnings_idr`, `incentive_earnings_idr`,
`adjustment_idr`, `tax_idr`, and `fee_idr`. Explicit metadata categories are
honoured for tax/fee/adjustment entries; legacy delivery, incentive,
adjustment/reversal and payout sources have deterministic fallbacks.

Payout requests expose gross amount, fee and net amount separately. Payout
fees are included in the statement fee total without changing the immutable
earning rows.

## Payout idempotency

Courier payout request creation requires an idempotency key and is serialized
by the database advisory lock plus the unique `(courier_id, idempotency_key)`
constraint. Provider dispatch uses a stable request idempotency key and a
unique dispatch record. Provider failure creates one compensating credit;
replaying the callback does not create a second reversal.
