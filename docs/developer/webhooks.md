# Webhooks

Webhook endpoints must use HTTPS. Localhost HTTP is accepted only in local
development; private-network targets and URLs containing credentials, query
strings, or fragments are rejected.

Each delivery contains a JSON envelope and these headers:

- `X-Lancar-Delivery-ID`: stable delivery identifier for replay deduplication.
- `X-Lancar-Event-ID`: canonical `event_outbox.id`.
- `X-Lancar-Timestamp`: Unix seconds when the attempt was signed.
- `X-Lancar-Signature`: `sha256=<hex HMAC-SHA256>` over
  `<timestamp>.<exact request body>`.

Consumers should reject timestamps outside their replay window (recommended
window: five minutes), verify the HMAC with the one-time secret, and record the
delivery ID before applying a side effect. Signing secrets are encrypted at
rest and are returned only when the subscription is created.

The delivery worker persists every attempt. Any 2xx response succeeds; network
errors, 408, 425, and 5xx responses retry with exponential backoff up to eight
attempts. Non-retryable responses and exhausted attempts become `dead` and are
visible through `/webhooks/{webhook_id}/deliveries`. The worker never mutates
the canonical `event_outbox`; it maintains its own cursor and delivery log.
