# LANCAR region contract

`region-catalog.yaml` is the repository source of truth for the multi-region
contract. It is written as a YAML 1.2 JSON subset so the validation and drill
tool can run with Python's standard library; do not add credentials or live
provider URLs to this file. Environment variables named by
`api_base_url_env` are supplied by the edge/deployment environment.

The catalog deliberately distinguishes three things:

1. A region can be healthy for read traffic without being approved for
   transactional writes.
2. A standby can be promoted only after a write fence, replication watermark,
   and operator approval are recorded.
3. Cross-region replication is field-scoped. Restricted payloads and provider
   credentials remain resident; only the minimum pseudonymous state needed for
   routing, replay, reconciliation, and recovery crosses the boundary.

The executable contract is `scripts/region_failover_drill.py`. It validates the
catalog and exercises the safe routing, outage degradation, promotion,
append-only replay, and mutation-deduplication rules. The drill is a local
deterministic proof of the decision logic, not a claim that a cloud region or
provider sandbox was exercised.

## Edge integration contract

The edge/load-balancer implementation must:

- probe each region's `/health` and `/ready` endpoints from outside the region;
- remove a region after three consecutive failed health probes and require two
  consecutive successes plus the configured cooldown before re-entry;
- send transactional writes only to the effective approved primary;
- stop routing transactional traffic when no approved primary is healthy;
- permit read-only projection traffic to a healthy standby only when the
  operation explicitly permits bounded staleness;
- propagate `X-Region-ID`, `X-Market-Code`, `X-Correlation-ID`, and the
  idempotency key without logging credentials or raw sensitive payloads.

The current repository deployment is single-VPS Compose. This contract is
therefore a promotion-ready boundary and runbook, not evidence of a live
second cloud region. Staging/production provisioning and a real region outage
drill remain release/SRE follow-up.
