# Threat model — provider webhooks

Provider callbacks are public transport but not trusted truth until the
provider signature, timestamp/replay window, event identity, amount/currency,
and native reference are verified. Accepted events are idempotently stored as
raw evidence and normalized through the canonical state machine; unknown or
late events enter reconciliation/exception handling. Callback failures never
log secrets or cause a blind second charge. Owner: Payment/Platform.
