# Experimentation and feature-flag contract — 2026

`feature_flags` remains the platform-wide kill-switch/configuration source.
Experiment definitions live in `experiments`; order-service is the server-side
assignment owner because it already owns authenticated order context and the
canonical event outbox. No separate experiment microservice is needed for this
bounded capability.

## Assignment

An assignment is deterministic for `(experiment key, subject type, subject,
server secret)`. The service uses HMAC-SHA-256, stores only the derived subject
hash, and selects a variant from integer basis-point weights. Targeting supports
market, city, app-version range/list, service, user cohort, and an explicit
allow-list of safe product attributes. Protected identity, health, precise
location, and other sensitive attributes are rejected.

Experiments sharing a namespace are mutually exclusive for a subject. The
assignment transaction takes a PostgreSQL advisory lock before checking the
namespace and inserting the assignment, so concurrent requests cannot create
overlapping assignments.

## Exposure and guardrails

An exposure is not created during assignment. The authenticated client must
call the explicit exposure endpoint after the treatment is actually seen or
used. Only treatment assignments can create `seen`/`used` exposures; the
assignment/surface/type key is idempotent. The exposure row and canonical
`experiment.exposure` event are committed together through `event_outbox`.

Every experiment carries guardrail definitions for crash/error, cancellation,
refund, ETA/SLA, and support contact metrics. Guardrails are sourced from the
governed canonical event stream and are not conversion-only metrics.

## Kill switch and financial boundary

Admin kill uses the primary database and changes the experiment status to
`killed`; order-service reads the primary for assignment, so the kill does not
wait for a cache or replica TTL. Existing assignments remain auditable and
existing quote/order snapshots are unchanged.

Variant payloads are product-safe presentation/configuration data only. The
control plane rejects financial keys (price, fee, tax, discount, payment,
refund, payout, currency, total, and related fields). Financial truth and
server validation remain owned by their canonical transactional services.
