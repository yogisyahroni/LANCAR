# APP Experience Manifest Contract — 2026

## Ownership and boundary

Experience manifests are owned by the existing `admin-service` configuration
boundary. They control presentation and exposure only. They must never carry
authoritative price, currency, tax, payment, refund, payout, order state,
authorization, risk, settlement, provider status, or executable code.

The transaction services remain the source of truth even when a manifest shows
a marketing CTA or service entry. A hidden or expired manifest does not remove
an active-order recovery path.

## Manifest shape

Each logical `manifest_id` has immutable revisions. A revision contains:

- `schema_version` — currently `1` (the server accepts the governed range 1–10).
- `revision` — monotonically increasing per `manifest_id`.
- `market_code`, BCP-47-like `locale`, and one `surface`:
  `customer_android`, `customer_web`, `merchant_android`, or `courier_android`.
- `min_app_version` and optional `max_app_version` using semantic versions.
- `starts_at`, optional `ends_at`, `ttl_seconds`, and `cache_policy`.
- `targeting.cohorts` and optional `targeting.experiment_ref`.
- `sections` using only the precompiled component whitelist.
- `asset_references` with HTTPS or `/assets/` URIs and SHA-256 checksums.
- server-generated `checksum` and optional HMAC `signature`.
- audit fields `published_at` and `published_by`.

The component whitelist is:

- `hero_banner`
- `campaign_strip`
- `promo_carousel`
- `service_grid`
- `info_card`
- `quick_actions`
- `notice`
- `spacer`

`service_grid` may use `service_codes` for ordering/visibility and may also
provide `cards` entries with a service `code`, presentation-only `subtitle`,
and presentation-only `badge`. The customer app intersects those entries with
the authoritative enabled-service response before rendering or navigation.

Each component has a strict property schema. Unknown components and unknown
properties are rejected before publication. HTML, JavaScript/data URLs,
arbitrary deep links, and protected transaction properties are rejected.

## Lifecycle API

Admin routes require an authenticated admin role, TOTP for mutations, and an
idempotency key for create/update/publish/rollback:

- `POST /admin/experience/manifests` — create a draft revision.
- `PATCH /admin/experience/manifests/:manifestId/draft` — update only a draft.
- `POST /admin/experience/manifests/:manifestId/preview` — validate and audit a
  preview without changing the revision state.
- `POST /admin/experience/manifests/:manifestId/publish` — atomically publish
  the draft and supersede the prior published revision.
- `POST /admin/experience/manifests/:manifestId/rollback` — atomically restore
  a historical revision, preserving every payload checksum.
- `GET /admin/experience/manifests` and
  `GET /admin/experience/manifests/:manifestId` — inspect revisions/history.

Published, superseded, and rolled-back payloads are database-protected from
mutation. The dedicated audit table is append-only and records actor, reason,
correlation ID, state transition, and revision metadata.

## Public resolver

`GET /api/v1/experience/manifest` requires:

- `market_code`
- `surface`
- `app_version`

`locale` defaults only to the requested market's configured locale when the
caller omits it; there is no Indonesia fallback for an unknown market.
Optional `cohort` and `experiment_ref` select a targeted revision. The server
filters active schedule and semantic-version range, prefers exact locale over
the market default locale, prefers matching targeting, and returns exactly one
manifest. Targeting rules and admin audit fields are not exposed publicly.

The response includes `ETag: "<checksum>"`, checksum/signature, cache policy,
resolved locale, and the safe component/asset payload. `If-None-Match` returns
`304` for an unchanged revision. Inactive or unknown markets fail closed with
a typed error; the resolver never silently falls back to another market.

## Operational/security requirements

- `EXPERIENCE_MANIFEST_SIGNING_SECRET` is read only from the environment or a
  managed secret store; production publication fails closed if it is missing.
- No secret, provider credential, customer content, or auth token belongs in a
  manifest, source file, evidence document, log, or screenshot.
- Preview and publication are configuration mutations and must carry a
  correlation ID in the audit trail.
- Rollback changes the active revision pointer/state only; it never edits the
  historical payload.
