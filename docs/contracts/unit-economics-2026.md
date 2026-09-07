# Unit Economics Contract — 2026

This contract is the shared Finance and Product definition for realized order
unit economics. It is implemented by the Admin `unit-economics` endpoint and
must not be replaced by analytics-only revenue or margin estimates.

## Scope and dimensions

The report includes orders whose financial timestamp is in the requested
window and whose status is `delivered`, `completed`, or `pod_completed`.
Every result has the same dimensions:

- `market` — pricing snapshot market, then service snapshot market, then
  `default`;
- `service` — canonical service bucket;
- `order_cohort` — day, week, or month selected by the report request.

## Required decomposition

```text
customer paid
  - customer refunds
  = net customer paid
  - tax
  - payment provider fee (MDR)
  - promo subsidy
  - merchant payable
  - courier payable
  - carrier payable
  - Ads/other attributed charges
  = platform contribution
```

The amounts are IDR and are derived from persisted financial facts:

- successful customer payment rows (`payments`);
- refund rows linked to the order;
- immutable order/pricing/settlement snapshots for tax, promo, and fallback
  policy components;
- `courier_earnings_ledger` for signed courier payable facts;
- `merchant_settlements` for merchant payable facts;
- provider invoice items or immutable order provider-cost snapshots for carrier
  payable;
- order-attributed double-entry expense debits for Ads/other charges.

Fallbacks are explicit and returned as `*_source`; they use an immutable
order/settlement snapshot, never an analytics estimate. The cohort window is
based on the order financial timestamp, while payment/refund/settlement/invoice
facts are attributed by `order_id` across their full history so late settlement
does not become a false zero. Missing payment facts, snapshot coverage, and
ledger coverage are returned in `source_coverage`; `reconciliation_status` is
`incomplete` when a realized order has no verified successful payment fact.

## Outlier trace

Every negative-contribution order includes its order identity, market/service
cohort, all decomposition components, pricing rule/policy version, merchant
contract version, pricing components, and source for each payable. Historical
orders remain traceable after a later pricing or commercial policy change.

## Ownership and client boundary

Admin/order-service owns the authoritative financial facts. Product and Finance
consume the same versioned definition and formula. Clients cannot submit or
override any amount; the dashboard only presents server-computed values.
