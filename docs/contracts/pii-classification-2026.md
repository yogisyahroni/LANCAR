# Event PII classification and retention — 2026

Contract version: `2026-09-08`

Event metadata carries both an event-level `pii_classification` and a
`field_pii_classification` map. The event-level class is the highest sensitivity
present in the event. A field may be downgraded only after a documented review;
unknown fields default to `restricted`.

| Class | Examples | Handling | Default retention |
| --- | --- | --- | --- |
| `public` | service code, coarse market code, schema version | safe for aggregate publication | `short` |
| `internal` | non-identifying counters, policy versions, capability flags | internal platform access | `standard` |
| `confidential` | order/payment/courier/merchant identifiers, amounts, SLA facts | role-scoped analytics access; pseudonymize actors | `financial` when money is present |
| `restricted` | addresses, phone/email, raw provider payload, device/GPS precision, secrets | never use in ML features by default; redact from logs/exports | `legal_hold` only under approved case, otherwise `standard` |

## Field rules

- Actor identity is always a stable pseudonymous value (`actor_*` or `anon_*`),
  never a raw account id, email, phone number, or device id.
- `entity_id` may identify an order, merchant, payment, courier, or refund, but
  is confidential and must not be used as a public label.
- Financial fields use integer minor units plus an explicit market currency.
- Raw addresses, contacts, provider payloads, GPS coordinates, credentials,
  access tokens, and webhook bodies are restricted. They are not copied into
  governed feature tables unless a separate purpose and retention policy exists.
- Logs contain event id, type, schema, market, service, correlation/trace id,
  and validation outcome only. Payloads and secrets are not logged.

## Retention classes

- `short`: operational/debug facts with a short bounded window.
- `standard`: ordinary product analytics and aggregate behavior.
- `financial`: payment, refund, GMV, and settlement facts retained according to
  the applicable finance requirement.
- `legal_hold`: explicit case-based hold; never selected as a convenience.

