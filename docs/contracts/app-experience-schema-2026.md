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
- `campaign_intro` (launch-only; consumed after the native OS splash)

`service_grid` may use `service_codes` for ordering/visibility and may also
provide `cards` entries with a service `code`, presentation-only `subtitle`,
and presentation-only `badge`. The customer app intersects those entries with
the authoritative enabled-service response before rendering or navigation.

Each component has a strict property schema. Unknown components and unknown
properties are rejected before publication. HTML, JavaScript/data URLs,
arbitrary deep links, and protected transaction properties are rejected.

`hero_banner` and `campaign_strip` are presentation-only banner components.
They may carry a localized `title`, optional `body`, `badge`, `campaign_id`,
checksum-verified `image_asset_id`, and one CTA target (`deep_link` or
`external_url`) with an optional `cta_label`. Internal CTA routes are mapped by
the native client to a finite typed destination set. External CTAs are limited
to the first-party HTTPS hosts `bawain.my.id`, `www.bawain.my.id`, and
`app.bawain.my.id`; the client hands them to the system browser only after the
same validation. A promo carousel item follows the same rule and uses its
`id` as the campaign identity when `campaign_id` is omitted.

`campaign_intro` is presentation-only and is consumed after the local native
OS splash. Its `campaign_id`, localized `title`/optional `body`, optional
`media_asset_id` (image/animation only), `frequency_cap_hours`,
`max_impressions`, `dismissible`, and `skippable` fields are evaluated against
the already-resolved manifest scope. The customer app never fetches campaign
media on the critical startup path; remote assets are staged into an isolated,
checksum-verified local bundle, while `/assets/` references are verified
against installed resources before the manifest becomes LKG.

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

Customer Android banner impressions and clicks are accepted at
`POST /api/v1/customer/experience/events`. The authenticated endpoint accepts
only `impression`/`click` events for `hero_banner`, `campaign_strip`, or
`promo_carousel`, and requires `manifest_revision`, `campaign_id`, and
`section_id`. It writes through the existing canonical `event_outbox` with a
pseudonymous actor and client event UUID; it never stores the raw customer
identity or client-supplied price/promo eligibility.

## Operational/security requirements

- `EXPERIENCE_MANIFEST_SIGNING_SECRET` is read only from the environment or a
  managed secret store; production publication fails closed if it is missing.
- No secret, provider credential, customer content, or auth token belongs in a
  manifest, source file, evidence document, log, or screenshot.
- Preview and publication are configuration mutations and must carry a
  correlation ID in the audit trail.
- Rollback changes the active revision pointer/state only; it never edits the
  historical payload.
