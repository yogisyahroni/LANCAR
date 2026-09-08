# Maps provider outage runbook

## Contain

1. Assign IC and Geo/Provider owner; identify affected map provider and market.
2. Confirm circuit state, timeout/error rate, quota and route-cache freshness.
3. Keep provider-specific tariff, ETA and service availability fail-closed when
   the authoritative provider response is unavailable.
4. For non-price map display only, use the configured fallback (for example
   OSRM/OSM or labeled approximate geometry) with `approximate`/degraded state.
   The fallback must not silently become pricing or SLA truth.

## Recover

1. Probe through the adapter after cooldown, then compare distance, route and
   provider metadata on a controlled sample.
2. Drain stale/degraded work only after the route cache and provider quota are
   healthy. Recalculate authoritative quote before payment/order creation.
3. Record affected markets, fallback exposure, provider errors, customer
   impact, SLO burn and follow-up owner.

