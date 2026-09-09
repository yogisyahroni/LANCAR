# LANCAR API and client compatibility policy

This policy governs the mobile customer, courier and merchant clients plus the
customer web client. The transaction services remain the source of truth for
price, payment, order state, refund, payout and authorization.

## Compatibility contract

Every current client sends these headers on every API request, including public
bootstrap/update requests:

| Header | Meaning |
| --- | --- |
| `X-App-Type` | `customer`, `courier`, `merchant` or `web` |
| `X-App-Platform` | `android` or `web` |
| `X-App-Version` | human-readable release version |
| `X-App-Version-Code` | monotonic client build code |
| `X-App-Schema-Version` | API payload/schema contract version |
| `X-App-Capabilities` | comma-separated compiled capabilities |

The server exposes the minimum supported build and supported schema versions in
`GET /api/v1/system/latest-version?type=customer|courier|merchant`. The response
also contains a `compatibility` object. A client below the minimum build or on
an unsupported schema receives `upgrade_required`; it must complete the update
flow before using a contract that requires the newer client.

Requests without a complete compatibility header set are treated as legacy and
are allowed to reach safe, server-authoritative APIs, but dynamic feature flags
are withheld. This keeps an older app usable without returning a dynamic UI
component it cannot render.

## Additive-first API evolution

1. Add fields as optional and preserve the old response shape and semantics.
2. Keep unknown response fields ignorable for clients.
3. Keep existing enum meanings stable; add a new enum value only after clients
   have an explicit unknown-value fallback.
4. Never change the meaning of money, tax, payment, refund, payout or order
   state fields in place.
5. A breaking change requires a new API/schema version, a documented migration
   path, a minimum-client rollout window and a rollback target.

Dynamic flags may declare `min_app_version_code`, `required_schema_version` and
`required_capabilities`. The server filters those flags against the request
compatibility before returning them. A flag cannot change authoritative
transaction behavior.

## Rollout window

The compatibility policy is code-owned and can be tightened with the
`MOBILE_CUSTOMER_MIN_VERSION_CODE`, `MOBILE_COURIER_MIN_VERSION_CODE`,
`MOBILE_MERCHANT_MIN_VERSION_CODE` and `MOBILE_WEB_MIN_VERSION_CODE`
environment settings. The database migration seeds the current policy metadata
for the mobile update endpoint. Raise a minimum only after the replacement
client is available through the release channel and the old-client window is
communicated.

## Safe old-client behavior

- Update metadata is public and reachable before authentication.
- Known incompatible clients receive an explicit upgrade-required signal.
- Legacy clients without headers do not receive dynamic feature flags.
- Order/payment/pricing decisions remain server-authoritative and are never
  inferred from a flag or client-side price.
- Unknown dynamic components are skipped by clients; the existing service/order
  path remains available.

## Verification

The executable contract tests live in
`backend/admin-service/src/services/clientCompatibility.test.ts` and
`backend/admin-service/src/controllers/featureFlagsPublic.controller.test.ts`.
They cover all client types, missing headers, minimum versions, schema
rejection, capability filtering and safe legacy behavior.
