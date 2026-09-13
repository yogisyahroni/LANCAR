# Threat model — provider webhooks

Provider callbacks are public transport but not trusted truth until the
provider signature, timestamp/replay window, event identity, amount/currency,
and native reference are verified. Accepted events are idempotently stored as
raw evidence and normalized through the canonical state machine; unknown or
late events enter reconciliation/exception handling. Callback failures never
log secrets or cause a blind second charge. Owner: Payment/Platform.

The control set is enforced at the provider adapter and webhook handler
boundary; provider-native status is retained and an unknown result is not
treated as a successful payment.

Review record: 2026-09-14 against commit `61bd269d`; high-risk remediation is
signature/replay/state validation and UNKNOWN/reconciliation handling,
verified by provider signature, payment-intent and refund-event tests. Live
vendor callback behavior remains unconfigured until vendor selection.
