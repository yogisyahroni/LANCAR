# Feature flags and staged rollout contract — 2026

## Ownership

`feature_flags` is the platform-wide source of feature configuration. The
admin-service evaluator is the canonical evaluator for client-facing flags;
clients consume the evaluated result and never calculate a rollout bucket.

Each change increments `feature_flags.evaluation_revision`. Public responses
return `evaluation_revision` per flag, and the service emits a structured
`feature_flag_evaluation` log containing the evaluated revisions. Targeting
rules are not returned to clients.

## Supported evaluation

The `config` object supports:

- `mode`: `off`, `on`, or `percentage`;
- `rollout_pct`: 0–100 with a stable SHA-256 actor bucket;
- `market_codes`/`markets`, `city_codes`/`cities`, `cohorts`;
- `client_types`, `min_app_version_code`, `max_app_version_code`;
- `required_capabilities` and an optional string `variant`.

Percentage rollout fails closed when there is no authenticated actor. Missing
targeting context fails closed for that target. Legacy operational config keys
remain preserved for owning services.

## Safety and governance

Payment, pricing, routing, settlement, security, authorization and other
server-authoritative controls are protected from the public client flag payload.
Their truth remains enforced in the owning backend service. A marketing or
presentation flag therefore cannot disable payment, order state, recovery or
security invariants.

Flags marked `require_checklist`, explicitly marked `high_blast_radius`, or in
a protected category/key require `super_admin` or `ops_security` approval,
TOTP on the mutating route, a change reason, and a rollback plan of at least 20
characters. The rollback plan is retained in immutable audit `checklist_data`.

## Client and recovery behavior

Customer, courier, merchant Android and customer Web clients replace their
evaluated cache on a successful fetch and retain the server revision for
diagnostics. Optional entry points may be hidden or disabled at runtime.
Active order lists, tracking, chat, proof, payment and recovery routes are not
gated by marketing flags. If an entry flag turns off while an order is active,
the active-order recovery surface remains accessible.

The public flag cache contains raw flag rows only; evaluation is performed per
request so market, city, cohort, app-version and actor targeting cannot leak
between users.
