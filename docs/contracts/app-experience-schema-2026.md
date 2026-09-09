# APP Experience Manifest Contract — 2026

## Ownership and boundary

Experience manifests are owned by the existing `admin-service` configuration
boundary. They control presentation and exposure only. They must never carry
authoritative price, currency, tax, payment, refund, payout, order state,
authorization, risk, settlement, provider status, or executable code.

The transaction services remain the source of truth even when a manifest shows
a marketing CTA or service entry. A hidden or expired manifest does not remove
an active-order recovery path.

During the migration from the legacy `global_banners` table, the resolved
Experience manifest is the authoritative home-presentation source whenever it
contains safe sections. The customer Android client renders legacy global
banners only as a compatibility fallback when no safe Experience sections are
available; it never renders both sources concurrently. The legacy admin banner
route remains available for the migration/backfill task and is not part of the
App Experience navigation group.

Promo campaigns remain owned by the Promo/Pricing domain for discount,
eligibility, budget, reservation and redemption truth. Experience may carry a
`campaign_id` and presentation copy only. Platform/runtime feature flags remain
owned by the existing `feature_flags` store; the App Experience control plane
links to that editor rather than creating a second flag store.

## Manifest shape

Each logical `manifest_id` has immutable revisions. A revision contains:

- `schema_version` — currently `1` (the server accepts the governed range 1–10).
- `revision` — monotonically increasing per `manifest_id`.
- `market_code`, BCP-47-like `locale`, and one `surface`:
  `customer_android`, `customer_web`, `merchant_android`, or `courier_android`.
- `min_app_version` and optional `max_app_version` using semantic versions.
- `starts_at`, optional `ends_at`, `schedule_timezone` (IANA timezone),
  `ttl_seconds`, and `cache_policy`. The timestamps are stored as
  unambiguous `TIMESTAMPTZ` instants; `schedule_timezone` preserves the
  authoring timezone for DST-safe operations and review. ISO timestamps with
  an explicit offset are respected; timestamps without an offset are treated
  as local wall-clock values in `schedule_timezone` and converted to UTC by
  the server. Nonexistent DST wall-clock times are rejected.
- `rollout_stage` — `public` for the normal audience or `canary` for an
  explicitly named internal/test cohort. `canary_cohort` is required for a
  canary and canary revisions are never returned outside that cohort.
- `rollout_percentage` — an immutable 0–100 percentage rollout. Values below
  100 use a deterministic server-side bucket keyed by manifest and authenticated
  user identity; anonymous requests are excluded from partial rollouts.
- `targeting` may use only governed, non-sensitive dimensions:
  `market_codes`, `city_codes`, `zone_codes`, `locales`,
  `service_usage_cohorts`, `user_status` (`new`/`existing`), `roles`,
  `cohorts`, `experiment_ref`, and `experiment_assignments`.
- `sections` using only the precompiled component whitelist. Each section has a
  deterministic array position and may carry an optional boolean `enabled`
  flag; omitted `enabled` preserves the legacy enabled behavior, and every
  accepted manifest must retain at least one enabled section.
- `asset_references` with HTTPS or `/assets/` URIs and SHA-256 checksums. Remote
  assets use a CDN/object-storage URL only; bucket credentials are never sent to
  the app. Each new reference records `content_type`, optional pixel
  `width`/`height` and `aspect_ratio`, `size_limit_bytes` (maximum 5 MiB),
  immutable `version`, optional `expires_at`, `cache_policy`, and
  `retention_until`. An optional `fallback_asset_id` identifies a lighter
  image/animation for metered or data-saver networks and must point to another
  declared asset without forming a cycle.
- server-generated `checksum` and optional HMAC `signature`.
- audit fields `published_at` and `published_by`.
- internal lifecycle fields `requires_approval`, `approval_status`, and the
  approval actor/timestamps. Broad untargeted campaigns require maker-checker
  approval; targeted campaigns may be published by the authorized publisher.

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
- `design_tokens` (campaign presentation presets; never rendered as a UI component)

The whitelist is surface-scoped. `customer_android` and `customer_web` may use
the full customer campaign/component set. `merchant_android` and
`courier_android` may use only `campaign_strip`, `info_card`, `quick_actions`,
`notice`, `spacer`, and `design_tokens`. The server rejects a component that is
valid in another surface, so operational merchant/courier content cannot
silently become a customer-home renderer payload.

`service_grid` may use `service_codes` for ordering/visibility and may also
provide `cards` entries with a service `code`, presentation-only `subtitle`,
and presentation-only `badge`. The customer app intersects those entries with
the authoritative enabled-service response before rendering or navigation.

Each component has a strict property schema. Unknown components and unknown
properties are rejected before publication. HTML, JavaScript/data URLs,
arbitrary deep links, and protected transaction properties are rejected.

Banner and promo presentation components may carry `campaign_id`,
`campaign_name`, localized copy references, `badge`, `alt_label`, validated
assets, typed first-party CTA targets, `frequency_cap_hours` (0–720), and
`max_impressions` (1–100). These fields describe presentation and exposure;
they never carry discount, price, eligibility, tax, or payment truth. Placement
is derived from the compiled component (`hero_banner`, `campaign_strip`, or
`promo_carousel`) so clients cannot invent a new rendering surface.

`design_tokens` is an optional, non-rendered section for bounded campaign
presentation theming. Its only properties are semantic presets:
`accent_preset` (`brand`, `campaign_orange`, `campaign_blue`),
`background_preset` (`surface`, `brand_soft`, `accent_soft`),
`corner_preset` (`compact`, `standard`, `emphasized`),
`spacing_preset` (`compact`, `standard`, `relaxed`), and
`badge_preset` (`hidden`, `label`, `pill`). The server and Android client map
these values to the packaged design system and enforce WCAG AA contrast of at
least 4.5:1. Missing or unsupported values use the packaged defaults. Remote
manifests cannot provide arbitrary colors, CSS, font families, font binaries,
JavaScript, WebViews, or executable UI code. The customer Android client
scopes these tokens to the dynamic dashboard campaign presentation; critical
booking, payment, order, and tracking screens remain on the packaged theme and
may explicitly opt out.

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
OS splash. Its `campaign_id`, optional internal `campaign_name`, localized
`title`/optional `body`, optional `media_asset_id` (image/animation only),
`frequency_cap_hours`, `max_impressions`, bounded
`display_duration_seconds`/`max_duration_seconds`, `dismissible`, and
`skippable` fields are evaluated against the already-resolved manifest scope.
The customer app never fetches campaign media on the critical startup path;
remote assets are staged into an isolated, checksum-verified local bundle,
with a bounded `prefetch_window_hours` of at most 24 hours before activation.
On metered/data-saver networks, the asset reference's
`fallback_asset_id` is preferred; if no verified fallback exists, the intro is
skipped. `/assets/` references are verified against installed resources before
the manifest becomes LKG.

## Lifecycle API

Admin routes require an authenticated admin role, TOTP for mutations, and an
idempotency key for create/update/approve/publish/retire/rollback. The dashboard
editor uses only the approved component schema and asset picker; it does not
allow arbitrary HTML, CSS, JavaScript, or remote executable content:

- `POST /admin/experience/manifests` — create a draft revision.
- `PATCH /admin/experience/manifests/:manifestId/draft` — update only a draft.
- `POST /admin/experience/manifests/:manifestId/preview` — validate and audit a
  preview without changing the revision state. An optional `audience` object
  (`market_code`, `locale`, `app_version`, city/zone, cohort, role, user
  status, service-usage cohort and experiment assignment) simulates the
  server resolver and returns only `matched`, a reason, a sanitized context
  and the selected revision; targeting rules are not returned.
- `POST /admin/experience/manifests/:manifestId/retire` — remove the published
  revision from public resolution while retaining its immutable history.
- `POST /admin/experience/manifests/:manifestId/approve` — checker-only
  approval for a broad/high-impact draft. The checker must be different from
  the creator; repeated approval is idempotent.
- `POST /admin/experience/manifests/:manifestId/publish` — atomically publish
  the draft and supersede the prior published revision. Broad drafts are
  rejected until approval is recorded. A canary publish remains isolated to
  its named cohort; public rollout is a separate revision.
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
Optional cohort, experiment reference/assignment, city/zone, service-usage
cohort, role and user-status context select a targeted revision. The server
filters the active timezone-aware schedule and semantic-version range, prefers
exact locale over the market default locale, prefers matching targeting, and
returns exactly one manifest. An untargeted revision is the explicit fallback
audience when a more specific audience does not match. Targeting rules and
admin audit fields are not exposed publicly.

The response includes `ETag: "<checksum>"`, checksum/signature, cache policy,
resolved locale, and the safe component/asset payload. `If-None-Match` returns
`304` for an unchanged revision. Inactive or unknown markets fail closed with
a typed error; the resolver never silently falls back to another market.

Customer Android experience telemetry is accepted at
`POST /api/v1/customer/experience/events`. Marketing events (`impression`,
`click`, `dismiss`) are limited to `hero_banner`, `campaign_strip`, or
`promo_carousel`; runtime events cover manifest fetch/cache/parse/schema
fallback, section rendering, broken assets, deeplinks, startup, and network
regressions. Every event carries a manifest revision, market, app version and
client event UUID; runtime events may also carry a manifest UUID, latency,
cache-hit flag, and a bounded error code. It writes through the existing
canonical `event_outbox` with a pseudonymous actor and never stores the raw
customer identity or client-supplied price/promo eligibility.

The admin observability view groups events by manifest revision, market, and
app version. Reliability guardrails count only runtime events: marketing
impressions, clicks, and dismissals are reported separately and cannot lower
or mask the reliability failure rate. The default one-hour guardrail requires
at least 20 runtime events and trips at a failure rate of 10% or more. A
tripped high-impact revision (`requires_approval = true`) automatically
restores the newest historical revision; lower-impact revisions return a
manual-rollback recommendation so an operator can make the decision with the
same audited rollback endpoint.

## Operational/security requirements

- `EXPERIENCE_MANIFEST_SIGNING_SECRET` is read only from the environment or a
  managed secret store; production publication fails closed if it is missing.
- No secret, provider credential, customer content, or auth token belongs in a
  manifest, source file, evidence document, log, or screenshot.
- Preview and publication are configuration mutations and must carry a
  correlation ID in the audit trail.
- Rollback changes the active revision pointer/state only; it never edits the
  historical payload.

## Asset delivery and lifecycle

The Android client verifies the HTTPS response content type, declared byte
limit, SHA-256 checksum, and declared image dimensions/aspect ratio before an
asset is atomically committed. It keeps the manifest and its asset bundle as a
single LKG envelope, uses bounded disk storage, and retains superseded bundles
for the manifest retention window so rollback or an already-cached revision
continues to render safely. Old temporary staging directories are cleaned up
after 24 hours.

Asset prefetch runs in a Wi-Fi constrained WorkManager job. The eligibility
policy selects only assets referenced by the audience-scoped manifest that is
active or starts within the next configured campaign window (up to 24 hours);
unreferenced campaign assets are never downloaded globally. On a metered or
data-saver network the client uses the declared fallback, or skips the campaign
when no verified lighter asset is available. The prefetch worker is
non-critical background work and cannot gate the native splash or first usable
screen.
