# P2P-Only Delivery and Courier Modes

## Production Decision

LANCAR now accepts only `p2p` as the active delivery route model.

Courier application modes are limited to:

- `on_demand`: courier receives direct on-demand P2P offers.
- `regular`: courier can run regular P2P pickup and delivery work.

Legacy `pickup_only`, `delivery_only`, `two_legs`, `three_legs`, and `hub_and_spoke` values are retained only for historical compatibility and rollback safety. New production writes must not create active delivery products, pricing configs, feature flags, or courier profiles that depend on those legacy modes.

## Database Enforcement

Migration `20260526000002_retire_relay_models_p2p_only.sql` performs the production cutover:

- Enables `model_p2p`.
- Disables and marks `model_two_legs`, `model_three_legs`, and `three_legs_relay` as retired.
- Forces active delivery service products to `route_model = 'p2p'`.
- Converts courier application channels from `pickup_only` and `delivery_only` to `regular`.
- Restricts new courier registration and capability rows to `on_demand` or `regular`.
- Adds `regular` courier status transition policies.

## Backend Contract

New pricing and routing requests must use P2P only. Requests that explicitly ask for `two_legs`, `three_legs`, or `hub_and_spoke` should fail fast instead of silently selecting a retired model.

Mobile courier APIs should return `workflow_role = 'on_demand'` only for delivery service products whose `service_category` is `on_demand`. P2P regular products should return `workflow_role = 'regular'`.

## UI Contract

Admin, customer portal, and courier mobile UI must not expose 2-kaki or 3-kaki as selectable production modes.

Allowed visible choices:

- Delivery model: `P2P`
- Courier mode: `On Demand` or `Regular`

Retired feature flags may be hidden from UI lists or rejected by backend validation if an old client attempts to enable them.
