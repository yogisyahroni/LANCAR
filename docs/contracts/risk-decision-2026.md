# Central risk decision contract — 2026

Contract version: `2026-09-09`
Owner: order-service risk module (decision/write authority) and admin-service (manual-review control plane)

## Boundary

Risk is a decision sidecar to transactional operations, not an order-state
machine. `order-service` calls it at `order_create`, `food_order_create`,
`dispatch_accept`, and `dispatch-start` checkpoints. The order/state mutation
remains authoritative in its own transaction boundary.

The initial implementation is a bounded module in `order-service`: the risk
write and order decision do not require a distributed transaction. A separate
deployment can be extracted only after independent scaling/availability or
security-boundary evidence justifies it.

## Inputs and decisions

Signals use the categories `account`, `device`, `payment`, `promo`, `gps`,
`handoff`, `refund`, `claim`, `provider`, and `collusion`. Every signal has a
bounded score, source and reason code. Exact location, contact details,
identity numbers, names, age, gender, religion, ethnicity, health and similar
sensitive attributes are rejected and are not used for targeting or decisions.

The only decisions are `ALLOW`, `CHALLENGE`, `REVIEW`, `HOLD`, and `BLOCK`.
Reason codes and the policy version are persisted with every decision.

## Failure policy

Policy is keyed by market and operation in `system_configs`:

- customer/order and dispatch operations fail open on risk-engine timeout/error;
- payment, refund, claim, provider callback, payout and handoff operations fail
  closed to `HOLD`;
- risk persistence is handled by the same operation policy and is never allowed
  to silently overwrite order state.

The timeout and failure mode are recorded. Policy configuration cannot enable
sensitive attributes.

## Manual review

`REVIEW` and `HOLD` decisions create one pending row in `risk_manual_reviews`.
Resolution requires an authenticated `super_admin`, `ops_security`, or
`ops_admin` session with TOTP and an idempotency key. The transaction records
reviewer, decision, reason and bounded evidence. The mutation is also covered
by the existing admin audit middleware.

## Privacy and events

The decision store keeps only a keyed subject hash and coarse signal snapshot.
The canonical `risk.decision` event contains no raw user/courier identifier,
exact GPS, phone, email, payment credential or free-form evidence. The event
is versioned and validated by the datalake worker.
