# Idempotency

All mutating developer operations require an `Idempotency-Key` header (the
legacy `X-Idempotency-Key` spelling is accepted for compatibility). Keys are
12–160 characters and are scoped by developer client and operation.

The service stores a SHA-256 hash of the canonical request body. Repeating a
key with the same body returns the stored status and response. Reusing a key
with a different body returns `409 ERR_IDEMPOTENCY_CONFLICT`; a concurrent
request returns `409 ERR_IDEMPOTENCY_IN_PROGRESS`.

Live quote and order requests pass the same key into the canonical order
service. The order service remains authoritative for pricing, payment
obligations, risk decisions, ownership, and state transitions. The developer
platform does not create a second financial or order source of truth.
