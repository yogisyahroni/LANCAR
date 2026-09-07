# Marketplace Fairness Contract — 2026

`GET /admin/analytics/marketplace-fairness` is the aggregate monitoring
contract for marketplace economics. It is protected by the Admin auth and
role middleware and returns only `market_code`, `zone_code`, and `service_code`
dimensions. No customer, merchant, or courier identifiers are returned.

The response covers:

- courier earning p10/p50/p95 from positive credit ledger entries;
- merchant exposure top-share and HHI from non-cancelled food orders;
- current/previous no-supply rates;
- customer total-price p50/p95;
- current/previous cancellation and acceptance rates;
- new/small merchant discovery share from discovery impression/click events.

The `window_hours` query parameter is bounded to 1–168 hours. Current and
previous outcome rates use equal windows so changes are comparable. Outlier
flags are evaluated independently per market/zone/service dimension.

`POST /admin/analytics/marketplace-fairness/evaluate` is the server-side
pre-approval guard. It compares baseline and candidate snapshots using
`marketplace-fairness-2026-v1`. A positive revenue uplift is informational and
cannot override a courier-earning, concentration, no-supply, customer-price,
cancellation, acceptance, or new/small-discovery violation. The endpoint
returns HTTP 409 when a violation exists and requires TOTP.

Dynamic/peak pricing has an emergency server-side rollback key:
`marketplace_pricing_kill_switch` in `system_configs`. When set to JSON boolean
`true`, new evaluations use multiplier `1.0`, retain policy/version context for
audit, and cause stale dynamic-pricing quotes to follow the existing requote
path.
