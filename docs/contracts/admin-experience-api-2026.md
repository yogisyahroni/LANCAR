# Admin Experience API contract — 2026

This is the authenticated contract used by the Admin Experience CMS. The
existing `admin-service` owns the API boundary and the
`experience_manifest_revisions` table remains the canonical source of
presentation configuration. The browser never writes the database directly.
Pricing, payment, order state, eligibility, tax and provider decisions remain
owned by their existing services.

## Authentication and request context

Every route below is behind the gateway-backed admin session. Mutating
manifest, approval, publication and kill-switch operations require TOTP and an
`X-Idempotency-Key`. The service emits `X-Request-ID`, `X-Correlation-ID` and,
when a manifest is returned, `ETag: "<sha256>"` plus
`X-Experience-Revision`.

The `data` envelope is stable:

```json
{
  "success": true,
  "data": {},
  "request_id": "...",
  "correlation_id": "..."
}
```

Validation failures use `success: false`, a stable `code`, and an `issues`
array containing `path`, `code`, and `message`. A stale draft returns HTTP
`409` with `EXPERIENCE_VERSION_CONFLICT`; a missing strong `If-Match` returns
HTTP `428` with `EXPERIENCE_PRECONDITION_REQUIRED`.

## Manifest lifecycle

| Method | Route | Purpose | Authorization |
| --- | --- | --- | --- |
| GET | `/admin/experience/manifests?market_code=&city_code=&zone_code=&surface=&locale=&app_version=&state=` | List revisions in an explicit scope; city/zone keep broad fallback visible and app version is range-aware | `experience.read` |
| GET | `/admin/experience/manifests/:manifestId` | Read revisions and append-only audit history | `experience.read` |
| POST | `/admin/experience/manifests` | Create a validated draft revision | `experience.draft.write` |
| PATCH/PUT | `/admin/experience/manifests/:manifestId/draft` or `/:manifestId` | Update the draft only | `experience.draft.write` |
| POST | `/admin/experience/manifests/:manifestId/validate` | Revalidate persisted draft and checksum | `experience.read` |
| POST | `/admin/experience/manifests/:manifestId/preview` | Audit a preview and simulate an audience | `experience.read` |
| POST | `/admin/experience/manifests/:manifestId/submit-approval` | Move a rejected high-impact draft back to pending | `experience.submit_approval` |
| POST | `/admin/experience/manifests/:manifestId/approve` | Checker approval; creator cannot approve | `experience.approve` |
| POST | `/admin/experience/manifests/:manifestId/reject` | Reject a pending high-impact draft with a reason | `experience.approve` |
| POST | `/admin/experience/manifests/:manifestId/publish` | Atomically publish after validation and approval | `experience.publish` |
| POST | `/admin/experience/manifests/:manifestId/rollback` | Restore an older immutable revision | `experience.rollback` |

Draft updates must send the latest strong `If-Match` value from the last
successful read. `X-Experience-Revision` may also be sent and is checked when
present. The service locks the manifest before comparing the checksum/revision,
so concurrent Admin editors cannot silently overwrite one another. The
dashboard sends both headers automatically.

The server parses and normalizes the complete manifest on create/update,
validate and publish. Publication also recomputes the canonical checksum (and
configured signature) inside the transaction, so a database row that has been
tampered with cannot be published. Broad manifests require maker-checker
approval; canary scope and fallback-audience rules remain enforced by the
existing manifest service.

## Collection capabilities

These collection routes expose the same bounded source of truth without
creating duplicate stores:

- `GET /admin/experience/assets?market_code=&surface=` lists deduplicated asset
  references declared by scoped revisions. `POST /admin/experience/assets`
  validates/normalizes an externally uploaded asset reference; the actual
  association is made by the draft manifest API. Bucket credentials and upload
  tokens never enter this service or a manifest.
- `GET /admin/experience/revisions?market_code=&surface=&state=` is the
  revision-list alias used by operational tooling.
- `GET /admin/experience/audit?market_code=&surface=&manifest_id=` lists the
  append-only audit records in scope.
- `GET /admin/experience/deep-links?market_code=&surface=` lists links found
  in scoped manifest sections. `GET /admin/experience/deep-links?include_usage=true`
  returns the manifest/revision references for deprecation analysis.
- `GET /admin/experience/deep-link-registry` returns the typed, version-aware
  first-party route registry and fallback route metadata. `POST
  /admin/experience/deep-links` validates a registered `route_id` plus its
  required parameters, or validates an allowlisted first-party HTTPS
  `external_url`; links are stored only as part of a draft.
- `GET /admin/experience/rollouts?market_code=&surface=` returns rollout and
  schedule state from revisions. `POST /admin/experience/rollouts` validates
  canary/public schedule input; changing a rollout is done through the draft
  API so it remains versioned and audited.
- `GET /admin/experience/kill-switches?market_code=&surface=` lists published
  exposure switches. `POST /admin/experience/kill-switches` and the
  manifest-scoped `/kill` and `/restore` routes perform the audited,
  idempotent emergency action.
- `GET /admin/experience/observability?range=24H&market_code=&surface=&app_version=`
  reports fetch/render reliability telemetry for the selected operational
  scope. Marketing impressions/clicks are kept separate from reliability
  failure-rate calculations.

## Audit contract

Every state-changing operation writes `experience_manifest_audit` in the same
transaction as its state change. The record contains the actor, reason,
correlation ID, previous/new lifecycle state, revision ID and timestamp. Its
metadata also includes the actor role, request ID, market, surface, previous
revision and new revision. The database trigger prevents audit mutation or
deletion.

## Error and retry rules

Clients may safely retry a mutation with the same idempotency key and identical
payload. A reused key with a different payload is rejected. A `409` version
conflict requires a fresh GET and user review before retrying; clients must not
blindly replay their stale editor contents.
