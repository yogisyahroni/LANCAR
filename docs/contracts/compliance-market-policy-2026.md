# Compliance Market Policy Contract — 2026

## Purpose

GLOB-2026-003 defines the market and role boundary for onboarding, consent,
retention, verification artifacts, and regulated service availability. A
market is never allowed to inherit Indonesian compliance rules implicitly.

## Ownership

- `admin-service` owns the market policy read model and the authenticated
  compliance policy/consent API boundary.
- `auth-service` remains the identity and authentication authority.
- Merchant onboarding and courier document modules remain the authorities for
  their verification artifacts and lifecycle state.
- The existing `market_service_availability` configuration remains the single
  source of truth for disabling a service category for a market/city.
- The Admin Security settings panel exposes the resolved policy and readiness
  state; changes to market service availability continue through the existing
  market configuration workflow.

This is intentionally a modular boundary in the existing configuration
ownership. A separate compliance microservice would duplicate market policy
and identity/artifact ownership without adding an independent availability or
security boundary.

## Policy model

Migration `20260908000023_global_compliance_boundary.sql` adds:

- `market_compliance_requirements` for explicit customer, courier, and merchant
  requirements, including requirement kind, locale, purpose, and policy
  version.
- `market_compliance_data_policies` for market-scoped data-class retention,
  export, deletion, and legal-basis rules.
- `market_compliance_artifact_policies` for least-privilege access and
  retention rules for sensitive verification artifacts.
- `market_compliance_consent_events` for immutable consent decisions.

Every policy is keyed by `market_code` and is effective only when its own
active/effective window matches the current time. Unknown markets return
`MARKET_NOT_CONFIGURED`; there is no default-market fallback.

The database readiness function requires the market configuration, legal
documents, at least one active requirement for each supported role, and an
active data policy. Existing service availability remains part of the same
fail-closed readiness decision.

## Consent contract

`POST /api/v1/compliance/consents` requires an authenticated customer, courier,
or merchant and an idempotency key. The request must identify:

- market code;
- requirement code;
- document type and document version;
- locale and purpose;
- granted or withdrawn decision.

The server verifies that the requirement, document version, locale, and purpose
are currently active for the actor's role and market. It records subject,
actor, actor type, timestamp, source, request IP/user-agent, and optional
metadata. Consent rows are append-only: withdrawal and later re-grant are new
events and never an update to an earlier event.

`GET /api/v1/compliance/consents` returns only the authenticated subject's
records. It does not expose another subject's verification artifacts or policy
secrets.

## Policy APIs

- `GET /api/v1/compliance/policy?market_code=<code>` is a public, cacheable
  policy resolver used before onboarding and service discovery.
- `GET /admin/compliance/policy?market_code=<code>` is restricted to
  `super_admin`, `ops_admin`, and `ops_security` and is used by the Admin GUI.
- Consent reads/writes are authenticated and routed through the gateway to the
  existing admin-service boundary.

Provider credentials, document contents, private keys, and raw identity
artifacts are never returned by these policy endpoints. Admin mutations remain
behind the existing authenticated, TOTP, and idempotency controls of the
market configuration workflow.

## New-market launch checklist

Before a new market is made active, an operator must configure and approve:

1. role requirements for customer, courier, and merchant;
2. approved legal documents and locale;
3. data retention/export/deletion policy;
4. artifact access and retention policy;
5. enabled service categories for each operating city;
6. market readiness with no fail-closed reason codes.

The readiness result and reason codes are displayed in Admin Security settings
so an incomplete market cannot be treated as ready by a client.

## Security and privacy

Policy records contain references and controls, not sensitive artifact content
or provider credentials. Artifact storage classes are restricted or
compliance-only, exports can be prohibited, and deletion can preserve a legal
hold. Consent history is immutable at the database trigger boundary. Logs and
task evidence must contain only status, identifiers safe for operational
correlation, and redacted error metadata; secrets and raw personal documents
must never be committed or recorded.
