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
