# New-market launch runbook

This is the release procedure for activating a market through the existing
`admin-service` market control plane. It is a hard gate: a market is not
activated when any required check is `FAIL`, `NOT_RUN`, or has an unresolved
owner sign-off. The public resolver must fail closed; it must never inherit
Indonesia defaults.

## Ownership and evidence

The market configuration, city/service availability, legal versions and
approval audit are owned by `admin-service` and PostgreSQL. Compliance policy
is market-scoped. Payment, maps and logistics providers keep credentials inside
their existing service/secret-manager boundaries. The launch record must carry
the market code, config version, correlation ID, release SHA, region, canary
cohort, approvers, rollback target and links to redacted evidence.

Required roles are Incident Commander, Market/Ops, Compliance/Legal,
Payments/Finance, Provider Operations, Geo/Maps, Database, Support,
Customer/Courier/Merchant mobile and backend on-call. Use
`docs/sre/service-catalog.md` and `docs/runbooks/incident-command.md` for the
role and escalation contract.

## Phase 0 — preflight

Run the repository-only gate first:

```text
python scripts/market_launch_readiness.py --validate --drill
python scripts/region_failover_drill.py --validate
python scripts/region_failover_drill.py --drill
```

This proves the local contracts and deterministic recovery logic. It does not
replace staging/provider/load evidence. Record the JSON output without tokens,
raw payloads or credentials.

## Phase 1 — market, compliance and residency

1. Create or inspect the market in `draft`/`scheduled` state with canonical
   country, region, currency/minor unit, locale, timezone, phone/address rules,
   service hours and scoped payment/logistics/maps/tax/insurance references.
2. Configure each launch city/service in `market_service_availability`.
3. Configure active customer, courier and merchant compliance requirements,
   data retention/export/deletion policy, artifact access policy and approved
   legal documents for every supported locale.
4. Confirm `market_config_readiness(market_code, city_code)` is ready with no
   reason codes. Confirm the region catalog has exactly one transactional
   primary, at least one standby, and no restricted field crosses residency.
5. Approve through the existing TOTP/RBAC-protected endpoint. Record the
   resulting `config_version`, `rollback_version`, actor and audit row.

Never write provider credentials, private keys, raw identity artifacts or
payment payloads into market config or launch evidence.

## Phase 2 — finance, tax and providers

1. Verify the market currency/minor-unit and tax rule/version on quote, order,
   payment, refund, payout, settlement and ledger snapshots. Run the applicable
   reconciliation queries/tests for order/payment, refund, payout, merchant,
   provider, tax, voucher and platform components. Any mismatch becomes an
   exception and blocks launch.
2. For payment, validate the environment mode, server-side key, callback
   signature, idempotency and reconciliation path. Rehearse sandbox-to-live
   cutover with two operators: create/validate the new secret reference, run a
   non-financial health/authentication probe, switch the reference, verify
   callback and rollback to the previous reference. Never paste keys into logs.
3. For maps, run the Admin Maps Production Readiness check. Confirm separate
   restricted keys, quota and fallback/text-only behavior. For logistics,
   validate every configured provider's declared capabilities, credentials,
   status mapping, timeout/retry/circuit and `UNKNOWN` behavior.
4. Record provider/payment cutover and rollback evidence separately for each
   environment. A fixture or mock proves only local mapping logic, never live
   provider availability.

## Phase 3 — localized clients and support

1. Run the customer web Chromium localization/accessibility suite.
2. Install the current customer, courier and merchant debug/release candidate
   builds on the approved emulator/device matrix. Verify locale selection,
   long-copy/RTL layout, market config, currency/tax display, quote, order,
   payment/refund state, courier payout and merchant settlement surfaces.
3. Verify support can see a typed unavailable/degraded/upgrade state and route
   a case with correlation ID. Verify on-call paging and the incident timeline
   are assigned for the market.

If no authorized runtime exists, record this phase as `NOT_RUN`; Gradle/unit
tests must not be relabeled as device E2E.

## Phase 4 — capacity and failover

1. Use `docs/sre/capacity-model.md` to record launch commitment RPS, peak
   forecast, test RPS (1.5x safety margin), database/Redis/RabbitMQ/gateway
   saturation, provider quota, queue/DLQ and socket metrics.
2. Run the approved k6 profile in a staging window. Pass only with recorded
   latency/error thresholds, resource headroom and safe overload behavior.
3. Execute `docs/runbooks/region-failover.md`: fence the old primary, verify
   watermark/RPO, promote one approved standby, replay/dedupe outbox, smoke
   transaction/payment/payout/provider paths, reconcile counts and record RTO.
   The local deterministic drill is necessary but is not a cloud outage result.

## Phase 5 — kill switches, canary and rollback

1. Before traffic, verify the server-side marketplace pricing and payout
   emergency kill switches, dynamic flag pause, provider fallback and market
   `paused`/service availability path. A paused market must return typed
   unavailable from the public resolver without a new client binary.
2. Start with a small market/cohort canary. Monitor quote/order error rate,
   payment callback/reconciliation mismatch, provider latency/quota,
   customer/courier/merchant support volume and regional SLOs.
3. If any invariant or SLO breaches, disable the dynamic flag/market service,
   keep authoritative transactions fail-closed, fence unsafe writes, and
   restore the previous config/policy version. Do not reverse financial ledger
   history as an application rollback.
4. Expand only after the observation window and owner sign-offs. Record the
   final status in `docs/checklists/market-launch-readiness.md`.

## Abort conditions

Abort activation for missing legal/compliance/data-residency policy, stale or
unreconciled money, unvalidated provider/payment cutover, missing capacity or
failover evidence, failed localized client flow, absent on-call ownership, or
an untested kill-switch/rollback. Keep the market `draft`, `scheduled` or
`paused`; no app release is required to disable it.
