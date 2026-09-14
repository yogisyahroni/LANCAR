# Staging capacity, quota and cost review — 2026-09-14

This is an evidence-backed staging review for the REALITY-2026-006 promotion
gate. It is not a production-capacity approval. The high-load payment profile
already failed and remains a no-go for stage promotion.

## Observed staging headroom

Read-only Docker and service snapshots were collected on the staging device:

| Resource | Observation | Decision input |
| --- | --- | --- |
| PostgreSQL | `max_connections=100`; 1 active / 25 total sessions; database size 83,677,999 bytes | Connection headroom is visible, but writer saturation/lock wait under sustained order load is not approved. |
| Redis | 1.58 MiB used; `maxmemory=0B`; `noeviction`; 17 connected clients; 0 blocked | No eviction safety limit is configured in this staging profile; this is a quota risk for promotion. |
| RabbitMQ | `background_tasks_dlq`: 45 ready, 0 unacked; `background_tasks`: 0 ready, 0 unacked, 1 consumer | Existing DLQ depth is a release bottleneck; it must be drained/reconciled before promotion. |
| Gateway / Admin / Order / Payment / Search / Routing | live containers healthy; instantaneous CPU 0.02–4.45% except no sustained load window | Container liveness is proven, not sustained critical-path capacity. |
| RabbitMQ / PostgreSQL instantaneous CPU | 77.57% / 53.33% at capture | Current transient infrastructure pressure is a bottleneck signal, not a capacity claim. |

The staging Compose services have no per-container CPU or memory limit in the
observed inspect output (`NanoCpus=0`, `Memory=0`); host-wide memory reporting
was 7.761 GiB. This must be made explicit in the next approved load window.

## Provider quota and cost decision

- Provider quota is **UNKNOWN** for the current TomTom/payment vendor setup;
  diagnostics do not expose an approved vendor limit. Unknown quota is treated
  as no-go, never as unlimited capacity.
- Canonical cost-per-usage evidence is available from the persisted unit
  economics contract and Admin report in `REALITY-2026-009`: usage units carry
  `unit_count`, `actual_cost_idr`, `costed_unit_count` and
  `unpriced_unit_count`; provider invoice and ledger sources remain separate.
- The dominant observed bottlenecks are the single admin/maps path under the
  1.5x city profile, RabbitMQ DLQ depth, absent Redis memory cap and unknown
  provider quota. These are recorded as release gates, not hidden behind a
  binary load result.

## Promotion decision

**NO-GO for next-stage promotion.** The database/queue/cache/provider quota
review has been executed and the capacity result includes cost and bottleneck
inputs. Sustained order-create, tracking/location, socket, storage-growth,
provider-quota and Finance/SRE approval remain release follow-ups.
