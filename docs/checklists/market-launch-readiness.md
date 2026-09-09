# Market launch readiness checklist

This checklist is the launch record for one `market_code`. It supplements the
existing `admin-service` market config and compliance contracts; it does not
create a second source of truth. Every row needs an owner, timestamp, evidence
link and one of `PASS`, `FAIL`, or `NOT_RUN`.

## Identity

| Field | Value |
| --- | --- |
| Market code |  |
| Country / region |  |
| Config version / rollback version |  |
| Release SHA |  |
| Home / standby region |  |
| Canary cohort / percentage |  |
| Incident ID / correlation ID |  |

## Current execution record — 2026-09-09

- Repository preflight: `python scripts/market_launch_readiness.py --validate --drill` — PASS (14 contract/drill checks; external runtime explicitly not claimed).
- Local client contract: `python scripts/mobile/check_localization.py` — PASS (three Android apps, web ID/EN parity and RTL-ready direction contract).
- Customer web localization E2E: Chromium — PASS (3 tests).
- Local PostgreSQL market snapshot: `id-jk` readiness returned ready with no reason codes; 9 active compliance requirements, 4 active data policies and 5 enabled services were observed. This is local evidence, not staging evidence.
- Staging CI: run `34297201449` for commit `6d2863ab` — repository verification, migration, security and build jobs PASS. Deployment guard reported `STAGING_SSH_HOST` missing, so `deployed=false`; browser E2E and k6 jobs were skipped.
- Public staging probe: `/health` returned `200`; current `/api/v1/system/latest-version?type=merchant` returned `400` and no compatibility metadata, confirming the pushed compatibility commit is not yet deployed there.

The hard-gate rows remain `NOT_RUN` until their required owner, environment,
provider, capacity and mobile-runtime evidence is attached. Do not activate a
market from this local record.

## Hard launch gates

| Gate | Owner | Evidence / command | Status |
| --- | --- | --- | --- |
| Market config, city/service availability and legal documents are approved and effective | Market/Ops + Compliance | Admin readiness endpoint and audit record | NOT_RUN |
| Customer/courier/merchant compliance and data-retention policy are active | Compliance/Legal | Compliance policy endpoint and residency record | NOT_RUN |
| Payment methods, tax references, maps and logistics capabilities are market-scoped | Finance + Geo + Provider Ops | Public config allowlist and provider readiness | NOT_RUN |
| Payment sandbox/live cutover and rollback rehearsal passed | Payments/Finance | Redacted cutover record and callback/reconciliation probe | NOT_RUN |
| Currency/tax/refund/payout/merchant/provider reconciliation has no unexplained mismatch | Finance | Reconciliation run ID and exception queue | NOT_RUN |
| Customer, courier and merchant localized flows pass E2E | Mobile/Web QA | Chromium plus approved emulator/device run | NOT_RUN |
| Support queue, incident commander and service on-call ownership are assigned | Support + SRE | Service catalog and incident record | NOT_RUN |
| Capacity/load profile passes with measured headroom | SRE | Approved k6 output and resource metrics | NOT_RUN |
| Region failover passes fencing, RPO/RTO, replay and reconciliation checks | Database + SRE | Failover drill record | NOT_RUN |
| Maps/logistics/payment provider cutover and fallback are safe | Provider Ops | Provider-specific redacted evidence | NOT_RUN |
| Pricing, payout, provider, flag and market-disable kill switches are tested | Ops + Finance | Kill-switch test record | NOT_RUN |
| Rollback restores prior policy/config without reversing authoritative ledger history | IC + Finance | Rollback record and audit rows | NOT_RUN |

## Repository preflight

Run before coordinating an environment window:

```text
python scripts/market_launch_readiness.py --validate --drill
python scripts/mobile/check_localization.py
python scripts/region_failover_drill.py --validate
python scripts/region_failover_drill.py --drill
```

The preflight is a repository-contract and deterministic-logic check. It must
remain separate from live staging, provider, store, cloud-capacity and device
evidence.

## Decision

- [ ] All hard gates are `PASS` with evidence.
- [ ] Canary owner and rollback target are recorded.
- [ ] Incident/support/on-call contacts are reachable.
- [ ] Activation approved by the market, compliance, finance and SRE owners.

If any row is `FAIL` or `NOT_RUN`, keep the market non-active or paused. The
existing market resolver and service availability controls allow degradation
without shipping a new app binary.

## Security

Do not store API keys, service-account JSON, private keys, payment payloads,
customer contact details, raw provider responses or auth tokens in this record.
Store only secret-manager references, aggregate results, safe IDs and redacted
error/correlation metadata.
