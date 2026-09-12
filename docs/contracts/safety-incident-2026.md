# Trust & Safety incident contract (SAFE-2026)

Trust & Safety is a separate aggregate from order state. An incident links the
reporter/counterparty, order or service, market, location snapshot, category,
severity, evidence references and escalation state. Creating or resolving an
incident never writes an order status; order pause, hold, reassignment or
cancellation must use the order domain APIs and remain separately audited.

Severity is operational policy, not presentation color: `CRITICAL`, `HIGH`,
`MEDIUM` and `LOW` map to explicit SLA windows and notification/escalation
handling. Critical incidents are not allowed to disappear into the ordinary
support queue.

Evidence references bind actor, incident, object key, SHA-256, content type,
size, retention and legal-hold metadata. Original objects are immutable; an
ordinary support view should use a redacted derivative. Object access and
downloads are audited. Public trip shares contain only the minimum tracking
data, use hashed random tokens, expire/revoke, and never grant mutation access.

The current courier-specific safety endpoints remain in the existing admin/order
boundary. Customer Safety Center and market-specific emergency routing are
additive surfaces over this contract; if an emergency provider is not configured,
the API must return a safe approved fallback status rather than claiming that an
emergency response was dispatched.

Emergency contacts are managed through the customer-scoped
`/api/v1/customer/safety/emergency-contacts` endpoints. Contact values are
encrypted with AES-256-GCM using the server-only `SAFETY_CONTACT_ENCRYPTION_KEY`;
responses expose only a masked hint, and revocation is a soft-disable. Missing
key configuration fails contact creation closed and never falls back to
plaintext storage.
