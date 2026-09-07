# Economics Control Plane Contract — 2026

## Ownership

`marketplace_economic_policy_revisions` is the workflow and audit source of truth for dynamic pricing/surge policy changes. `system_configs` remains the runtime source consumed by order-service. A publish atomically updates both the revision state and the runtime config; an order/quote already persisted keeps its own pricing snapshot.

The control plane currently supports `pricing` and `surge` revisions. Courier incentive campaigns and merchant commission contracts remain owned by their existing dedicated tables/controllers, so this control plane does not create a second source of truth for those resources.

## Workflow API

All endpoints require an authenticated admin identity. Mutations require TOTP and accept `X-Idempotency-Key` through the existing idempotency middleware.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/admin/economics/policies` | List revisions, optionally filtered by status/type/market. |
| GET | `/admin/economics/policies/:id` | Read one immutable policy revision and its actor evidence. |
| GET | `/admin/economics/policies/:id/preview` | Show affected market/zone/service, active-order count, current runtime payload, and server-generated example quotes. |
| POST | `/admin/economics/policies` | Create a `draft` with a business reason. |
| POST | `/admin/economics/policies/:id/simulate` | Re-run server-side examples for a draft or approved revision. |
| POST | `/admin/economics/policies/:id/approve` | Checker approves a draft; maker and checker must differ. |
| POST | `/admin/economics/policies/:id/publish` | Super-admin publishes an approved revision to `system_configs`. |
| POST | `/admin/economics/policies/:id/rollback` | Super-admin restores the exact runtime snapshot captured at publish. |

## Policy safety

- `floor_multiplier >= 1`.
- `ceiling_multiplier` and `protected_cap_multiplier` cannot be below the floor.
- The maximum protected cap is server-owned: food `1.4`, roadside `1.2`, and other on-demand services `1.5`.
- `peak_multiplier` is bounded by the same protected cap.
- `fairness_reviewed` must be `true`, and peak windows must use valid half-open hours.
- The runtime key is restricted to `dynamic_pricing_policy_*`; arbitrary config keys cannot be published by this API.
- Only a super-admin can publish or rollback. The database trigger also rejects invalid workflow transitions, so direct SQL cannot bypass maker-checker state invariants.

## Preview semantics

Example quotes are explicitly marked `server_simulation_only` and are calculated from the persisted `delivery_service_products` tariff (with the active legacy `pricing_configs` row as a compatibility read path). They are impact evidence, not customer quotes. Final customer price remains order-service authoritative.

Every draft, approval, publish, and rollback writes `audit_logs` with actor, action, policy identifier, runtime key, and business reason. No customer, merchant, or courier identifiers are returned by the preview aggregate.
