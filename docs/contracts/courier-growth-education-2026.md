# Courier growth and supply education contract (2026)

## Incentives

`courier_incentive_campaigns` remains the source of truth for active campaign
configuration and `courier_incentive_progress` remains the source of truth for
the courier's progress. The courier performance endpoint returns progress,
readiness status, target, reward and expiry together.

Campaign mechanics are limited to server-approved delivery-count or
completion-quality mechanics. The database rejects metadata that requires
speeding or marks a campaign as unsafe, and stamps the active safety policy
version. The client receives a safety notice and never receives a speed,
countdown or unsafe-driving instruction.

## Education modules

The existing `feature_flags` config can supply dynamic `modules` for the
courier growth surface. The server sanitizes titles, summaries, types and
priority, limits the number of modules, and forcibly returns:

- `action = read_only`;
- `can_mutate_job_state = false`;
- `source = courier_growth_config`.

Modules are informational. Only domain APIs may change duty, offer or order
state; the education payload has no state-mutating action.

## Zone demand insight

`courier_hotspot_rollups` is a server-generated demand snapshot, not a promise
of available work. Each hotspot response includes `demand_estimate`,
`freshness`, `demand_source`, `demand_score`, `recent_orders` and
`refreshed_at`. The courier UI displays the estimate label and its freshness /
source alongside the zone.
