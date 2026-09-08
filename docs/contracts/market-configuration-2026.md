# Market Configuration Contract 2026

## Ownership

`admin-service` owns the market configuration control plane. It persists the
canonical market policy, city/service availability, legal document versions,
and append-only approval history in PostgreSQL. The API gateway only routes
requests; it does not own or cache market truth.

## Canonical market identity

Every market has:

- a lowercase `market_code` used by APIs;
- an uppercase ISO-3166 `country_code` and `region_code`;
- ISO-4217 `currency_code` plus `currency_minor_unit`;
- default locale, IANA timezone, metric/imperial measurement system;
- validated phone and address rules;
- launch state and approval state;
- monotonically increasing `config_version`, `effective_from`, and a previous
  `rollback_version` when a material change is made.

The initial `id-jk` row is an Indonesia/Jakarta operating policy. It is not a
demo transaction seed. Other markets must be created and approved through the
admin control plane.

## Scoped policy data

`market_service_availability` scopes service enablement, service hours, and
policy references by market, city, and service code. Payment methods, logistics
providers, map providers, tax policy references, insurance policy references,
and default service hours are stored on the market policy as capability/policy
identifiers. Provider credentials remain in environment/secret-manager
configuration and are never accepted by the market API.

`market_legal_documents` stores market/locale/document type/version,
`effective_from`, public URI, and approval metadata. Terms and privacy must be
approved and effective before a market can become transaction-ready.

## API

Public clients call:

```text
GET /api/v1/markets/config?market_code=id-jk&city_code=jakarta
```

`market_code` is required. There is no Indonesia fallback. The response is an
allowlist containing public market facts, scoped capabilities, effective legal
documents, and service availability. Actor IDs, audit snapshots, approval
metadata, and credentials are not returned.

Admin users call:

```text
GET  /api/v1/admin/market-configs
GET  /api/v1/admin/market-configs/:marketCode
POST /api/v1/admin/market-configs
PATCH /api/v1/admin/market-configs/:marketCode
PUT /api/v1/admin/market-configs/:marketCode/services
PUT /api/v1/admin/market-configs/:marketCode/legal-documents
POST /api/v1/admin/market-configs/:marketCode/approve
GET  /api/v1/admin/market-configs/:marketCode/audit
```

Mutating calls require the existing admin role/TOTP/idempotency middleware.
Material changes increment the version, set the market to paused/draft, reset
approval, and write a dedicated audit row with actor, reason, correlation ID,
previous version/snapshot, and new version/snapshot. Approval is separate and
fails if the database readiness function finds an incomplete policy.

## Fail-closed readiness

`market_config_readiness(market_code, city_code)` is the database-level
readiness decision used by the public resolver and approval endpoint. It
rejects unknown, inactive, unapproved, not-yet-effective, incomplete, or
uncovered markets with typed reason codes. A client must show an unavailable or
retry state; it must not infer Indonesian currency, provider, tax, or service
availability.
