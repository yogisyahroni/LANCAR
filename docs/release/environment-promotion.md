# Environment promotion model — PART AG

Promotion order is local/dev → integration → staging → pre-production →
production. Each environment has isolated credentials and provider endpoints;
production data is never copied into staging. Database changes are migration-
first and rehearsed on a disposable database before staging. Provider sandbox
cutover and callback signature tests precede live enablement. Feature flags
provide soft rollout and preserve active-order/support recovery when disabled.

The staging mapping for this device is:

- API: `https://api.bawain.my.id`
- Customer web: `https://app.bawain.my.id`
- Admin dashboard: `https://admin.bawain.my.id`
- Landing: `https://bawain.my.id/`

Promotion evidence records commit, image digest, migration IDs, health checks,
guardrail metrics, approver, and rollback target. OTP and payment vendor-live
checks remain disabled until the owner selects/configures the external vendors.

## Environment boundary contract

| Environment | Configuration/secrets source | Provider endpoint rule | Data rule | Release control |
| --- | --- | --- | --- | --- |
| local/dev | local `.env` or process environment only | deterministic local adapters or explicitly named sandbox | synthetic/local data only | developer command |
| integration | protected CI environment variables/secrets | sandbox endpoints and test credentials | isolated CI database | CI workflow gate |
| staging | protected `staging` environment secrets and the staging tunnel | staging/sandbox endpoints; no production payment or OTP enablement | staging data only; never copy production dumps | `staging` branch plus deployment guard |
| pre-production | protected pre-production environment | sandbox-live-like endpoints after callback/signature verification | sanitized fixture or approved synthetic dataset | approved release/canary gate |
| production | protected `production` environment and managed secret store | production endpoints only after provider owner cutover | production data stays in production | manual approval, immutable artifact and rollback target |

The application receives environment-specific URLs and credentials through the
deployment environment; source code and committed `.env` examples do not carry
provider secrets. A promotion changes the immutable artifact/config revision,
not the source of truth for orders, payments, ledgers or provider callbacks.

## Cutover sequence

1. Apply and verify migrations on a disposable PostGIS rehearsal database and
   record the migration version, row-count invariants and rollback result.
2. Deploy the immutable candidate to staging and run health, contract and
   authenticated smoke checks against the canonical staging hosts above.
3. Verify provider sandbox request/signature/callback/reconciliation behavior
   using the owning adapter; keep OTP/payment vendor-live routes disabled until
   the owner-approved provider credentials and window exist.
4. Promote feature flags independently with an evaluation revision, cohort or
   percentage, guardrail metrics and an explicit rollback plan. Active-order,
   support and safety routes remain available when a presentation/marketing
   flag is disabled.
5. For production, require the protected environment approval, immutable
   image digest, migration list, health/guardrail evidence and a previous
   artifact rollback target. Never copy a production database dump downward.
