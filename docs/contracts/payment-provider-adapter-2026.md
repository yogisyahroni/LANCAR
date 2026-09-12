# Payment provider adapter contract (PAYPLAT-2026)

`backend/payment-service/internal/provider` is the orchestration boundary for
provider integrations. An adapter advertises capabilities explicitly. A caller
must reject an operation when the capability is absent; it must never synthesize
a successful provider result.

Every create/refund request carries an idempotency key and the canonical intent
reference. The adapter response preserves the provider-native reference, raw
status and raw payload for reconciliation. Credentials and webhook signatures
are handled inside the server-side adapter; they are not returned to clients.

The router records a versioned routing rule, filters by market/currency/method
and capability, and excludes providers whose health state disallows new
attempts. Provider callback and reconciliation processing remains enabled even
when new attempts are disabled. An override is scoped to market/method, has an
expiry, a reason and an audited actor.

Failover after a provider call is only legal before irreversible mutation or
after a provider lookup proves that no charge occurred. A timeout with an
unknown result is therefore reconciled/looked up, never blindly charged through
a second provider.

The canonical intent state machine is in
`backend/payment-service/internal/domain/payment_intent.go`. Raw provider
statuses are evidence fields; normalized intent state is the only state that
may be used by order/payment orchestration.

## Current staging boundary

The repository currently has no approved payment vendor configuration for the
new multi-provider orchestration path. Midtrans/Xendit credentials remain
environment-managed and are not added to source or evidence. The contract and
state-machine verification below are local proof; provider-live sandbox
validation is a release follow-up until a vendor is selected and configured.
