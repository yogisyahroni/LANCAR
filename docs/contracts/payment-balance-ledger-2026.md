# Payment balance and liability ledger contract

`payment_balance_accounts` is the typed boundary for customer credit/refund
credit, merchant payable, courier earnings, Ads balance, and promotional
credit. Each account is scoped by owner, market, and currency. The existing
finance ledger remains authoritative for double-entry journals; these rows are
the typed payment orchestration projection and never replace it.

`payment_balance_entries` is append-only and has a unique idempotency key.
Hold, release, settle, reversal, credit, and debit are recorded as entries in
a database transaction. A duplicate event returns the existing result and
cannot apply a second balance mutation. Promotional credit is explicitly
non-withdrawable; it may only be consumed or reversed according to the
campaign policy.

Stored-value or customer-credit launches require Finance/Legal review for the
target market. The current staging deployment records the boundary and tests
the non-withdrawable invariant; it does not claim a licensed stored-value
product or a live provider settlement.

The payment service exposes the internal-only operation boundary at
`POST /api/internal/payment/balances/operations` with `X-Internal-API-Key`.
Operations are serialized by account row lock, and the append-only projection
computes available and held minor units from `CREDIT`, `DEBIT`, `HOLD`,
`RELEASE`, `SETTLE`, and `REVERSAL` entries. Reusing an idempotency key with a
different account, source, amount, or operation is rejected. This endpoint is
not routed as customer-facing API and does not make promotional credit
withdrawable.
