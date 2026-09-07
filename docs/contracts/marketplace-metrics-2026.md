# Marketplace Metrics Contract — 2026

The order-service surge worker publishes an aggregate snapshot for each
`zone_id/service_code` pair with recent marketplace demand:

`marketplace_metrics:<zone_id>:<service_code>`

Snapshots have the same ten-minute TTL as the derived surge multiplier. They
contain the rolling demand window, observed timestamp, latest lifecycle event,
event age, `data_fresh`, available/idle capable courier counts, acceptance
rate, match time, no-supply count, idle time and ETA. The snapshot contains no
customer, merchant or courier identifiers.

Supply is counted only when a courier is approved/verified, online, assigned to
the zone, capable of the requested service, and in the `idle` availability
state. A missing availability-state row follows the existing availability
service policy and is treated as idle; all other active states are excluded.

Demand is grouped by the canonical service code, pickup zone and a rolling
15-minute window. `order_events` provide the lifecycle freshness signal. When
the latest relevant event is older than five minutes, `data_fresh` is false and
the surge worker records the snapshot but does not add a demand-based price
step. Weather/provider multipliers remain bounded by the configured ceiling.

The existing `surge_multiplier:<zone>` and `surge_multiplier:global` keys remain
backward-compatible. When multiple services are present in a zone, those keys
use the highest bounded service multiplier; the detailed snapshot preserves the
service-level explanation.
