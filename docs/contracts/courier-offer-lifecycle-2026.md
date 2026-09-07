# Courier offer lifecycle and fairness contract — 2026

This contract is the canonical policy for on-demand courier offers. The
existing `courier_offer_dispatches` row is the offer identity and lifecycle
source of truth; `orders` and `order_legs` remain the authoritative order and
assignment state.

## Offer contents and lifecycle

Each offer contains or resolves the following facts before it is shown to a
courier:

| Fact | Source / rule |
|---|---|
| Offer identity | `courier_offer_dispatches.id`, with `order_id` and `courier_id` |
| Expiry | `expires_at`, created with `ON_DEMAND_OFFER_TTL_SECONDS = 90` |
| Service | `orders.service_code` / `service_sub_type` and enabled `delivery_service_products` |
| Route | persisted order route snapshot, provider/profile, distance, duration, ETA, vehicle type, and snapshot version/hash |
| Earning | persisted order payout estimate plus the earning policy/components snapshot |
| Proof | service-specific proof requirements derived by the existing offer normalizer |
| Capability | enabled `courier_service_capabilities`, eligibility policy, and the offer `capability_requirements` fact |

The offer API and realtime notification carry the same offer TTL, service,
route, earning, proof, capability, and policy-version facts. Customer drop
address remains hidden until acceptance.

Lifecycle states are `offered`, `accepted`, `rejected`, `expired`, and `lost`.
Expiry is terminal for that dispatch attempt: the expiry worker records
`response_reason = 'ttl_expired'`, and acceptance checks both state and
`expires_at` while holding the dispatch row lock. Therefore an expired offer
cannot create an order leg or ghost assignment.

## Atomic and idempotent acceptance

The accept endpoint runs in one database transaction. It locks the selected
dispatch row, serializes concurrent acceptance attempts for the authenticated
courier with a transaction advisory lock, rechecks presence/capability/workload
eligibility, locks the order and first leg, and only then writes the accepted
leg, accepted dispatch, competing `lost` dispatches, and order event. The
route is protected by `requireIdempotencyKey('courier.offer.accept')`; retries
from the Android repository use a stable offer-specific key. The shared
idempotency store replays a completed response or rejects a conflicting
payload, so a network retry does not create a second assignment.

## Versioned strategy and fairness policy

Every dispatch metadata payload and `offer_dispatched` event records:

- `dispatch_strategy_version = dispatch-engine-2026-v1`;
- `offer_rule_version = courier-offer-rules-2026-v1`;
- `performance_signal_policy_version = courier-performance-signals-2026-v1`.

The current deterministic ranking rule is:

```text
distance factor 60% + rating 25% + completion rate 10% + acceptance rate 5%
```

Acceptance and completion rates are bounded ranking signals only. They do not
hard-exclude an otherwise eligible courier and cannot create a permanent
lockout. A timeout or courier cancellation is retained as a dispatch response
reason and the queue may offer the order to the next eligible courier. Manual,
provider, and operational cancellation paths must preserve the dispatch/event
audit trail. Any future enforcement must be separately versioned, time-bounded,
reason-coded, and appealable rather than inferred from a single offer outcome.
