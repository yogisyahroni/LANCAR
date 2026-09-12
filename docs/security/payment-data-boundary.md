# Payment data boundary — PAYPLAT-2026-004

## Boundary

Customer and marketplace services accept only a provider token/reference or a
hosted payment-session result. Raw PAN, CVV, PIN, provider secrets and webhook
signatures stay inside the server-side provider adapter boundary. The canonical
payment intent stores normalized state plus provider-native reference/raw
status needed for reconciliation; it does not store card credentials.

## Authentication and saved methods

`REQUIRES_ACTION` is the canonical challenge state for 3DS/SCA or another
provider authentication step. Saved methods are scoped by customer, provider,
market and method type, and revocation is represented by `revoked_at`. The
client cannot write a paid state.

## PCI and logging

The hosted-fields/tokenized integration is the preferred low-scope path. The
payment-service and admin-service remain out of raw-card handling scope only
when the selected provider integration preserves that boundary; Finance and
Security must review the resulting PCI responsibility matrix per market before
enabling a provider. Payment logs and traces use the existing redaction policy;
secrets, tokens, authorization data and raw sensitive payloads must not enter
task evidence, screenshots or public logs.

## Release follow-up

Provider onboarding must attach the vendor PCI responsibility matrix, sandbox
3DS/SCA evidence and a redaction review before enabling a live card method.
