# Merchant Operating State Contract — MERCH-2026-004

## Source of truth

`merchants.operating_state` is the canonical state consumed by order-service,
Food discovery, Search indexing, and Ads eligibility. `is_open` remains a
backward-compatible boolean projection: only `open` and `busy` project to
`TRUE`.

The allowed states are:

- `open` — accepts new orders.
- `closed` — outside schedule or explicitly closed.
- `busy` — accepts orders, while the existing busy prep policy extends ETA.
- `paused` — rejects new orders until the pause expires.
- `temp_closed` — an audited temporary closure.
- `holiday` — a scheduled/special closure.

## Schedule and timezone

The merchant's `operating_timezone` is an IANA timezone and defaults to
`Asia/Jakarta`. The operating-hours worker evaluates weekly hours and special
closures in that timezone, including overnight shifts. Schedule projections
must not overwrite an active pause, busy window, temporary closure, or
indefinite admin override.

## Admin/support override

`POST /api/v1/merchant/operating-state/{merchant_id}/override` requires a
gateway-authenticated actor, an allow-listed admin/support role, and
`X-TOTP-Verified: true`. The request contains `state`, `reason` (1–500
characters), and a future `until` for `temp_closed` (optional for `holiday`).

The state update, `merchant_operating_state_events` audit row, and durable
`event_outbox` record are committed atomically. The audit records actor ID,
role, reason, source, and monotonically increasing state version.

## Downstream event

Each canonical state/version change emits `merchant.operating_state.changed`.
Its headers identify `search-index` and `ads-eligibility` as consumers and
`merchant-service` as the source of truth. Consumers must treat the state
version as monotonic and ignore stale/out-of-order projections.
