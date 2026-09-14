# Capacity forecast matrix — 2026-09-14

This is the written Platform/SRE launch-commitment assumption required before
using a load number. It is not a production traffic claim. Values are
reviewed at each promotion and replaced by measured demand when available.

## Forecast units

| Stage | Launch commitment: quote/order/tracking RPS | Order concurrency | Authenticated sockets | Location events/s | Payment/provider callbacks/s | Storage growth/day |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| internal/dev | 2 / 0.5 / 1 | 20 | 25 | 5 | 1 | 0.1 GB |
| closed beta / single area | 25 / 5 / 10 | 250 | 250 | 50 | 5 | 1 GB |
| city production | 75 / 15 / 30 | 750 | 750 | 150 | 15 | 3 GB |
| multi-city | 250 / 25 / 100 | 1,250 | 2,500 | 500 | 25 | 10 GB |
| national | 1,000 / 100 / 400 | 5,000 | 10,000 | 2,000 | 100 | 50 GB |
| multi-country | 5,000 / 500 / 2,000 | 25,000 | 50,000 | 10,000 | 500 | 250 GB |
| multi-region | 20,000 / 2,000 / 8,000 | 100,000 | 200,000 | 40,000 | 2,000 | 1 TB |

The rows are planning assumptions, not approvals. Quote is route/quote
calculation, order is authoritative order creation, and tracking is the
courier location/tracking write path. Callback volume includes payment and
logistics provider callbacks. Storage includes transactional, event,
observability and media metadata growth; object-storage bytes must be refined
by the owning Finance/Platform review.

## Safety-margin test calculation

Before promoting from a stage, use the next row as the demand forecast and
test at `forecast × 1.5` for each measured flow. The existing bounded staging
search observations exercised the closed-beta quote proxy at 25 RPS and a
multi-city proxy at 50 RPS (2× the single-area commitment), with 100% HTTP
success. The bounded payment callback rehearsal is not a peak order-create or
provider-quota test.

No unmeasured row is represented as a PASS. Order-create, tracking/location,
WebSocket, provider callback, sustained duration and quota measurements remain
required before the corresponding stage is promoted.

## Resource/quota/cost decision inputs

Each promotion record must attach PostgreSQL writer/read saturation and lock
wait, Redis memory/eviction/pub-sub fanout, RabbitMQ ready/unacked/DLQ depth,
gateway CPU/memory/bulkhead load, provider rate limits/retry budget, and
storage growth. Cost is calculated per quote, order, tracking event, socket
hour, callback, GB-month and support case from the canonical usage/ledger and
provider invoice references. Missing quota or invoice evidence is a no-go,
not zero cost.

## Current decision

The forecast matrix is complete as an explicit, reviewable assumption. Current
staging evidence remains a bounded baseline; it does not approve the next
stage because sustained critical-path load, quota/headroom, storage trend and
unit-cost reconciliation are still missing.
