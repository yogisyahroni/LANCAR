# Admin Experience source-of-truth contract

This contract closes ADMEXP-2026-018 without creating a second persistence
boundary. It records the ownership found in the repository before the
Experience CMS was extended.

## Inventory and ownership

| Capability | Existing persistence | Existing API/UI | Canonical owner after cutover |
| --- | --- | --- | --- |
| Banner presentation | `global_banners` | `/admin/banners`, `/api/v1/customer/banners`, `Banners.tsx` | Experience manifest revisions for presentation; `global_banners` remains read-only mobile compatibility fallback during migration |
| Platform promo economics | `promo_campaigns` | `/admin/promos`, `Promos.tsx`, `promoEngine.ts` | Promo/Pricing domain |
| Merchant-funded promo economics | `merchant_promos` | Merchant promo/business flows | Promo/settlement business domain |
| Runtime feature flags | `feature_flags` and `feature_flag_logs` | `/admin/feature-flags`, `FeatureFlags.tsx` | Existing feature-flag service/store; App Experience exposes the same component and API |

The local inspection snapshot on 2026-09-09 contained one legacy global banner,
zero promo campaign rows, zero merchant promo rows, 41 feature-flag rows, and
zero experience manifest revisions before the backfill. The counts are an
inventory observation, not a new product requirement.

## Migration boundary

`database/migrations/20260909000017_admin_experience_legacy_cutover.sql`
backfills active `global_banners` rows into one deterministic
`customer_android` manifest per configured market. It preserves priority order,
title/message and allowlisted CTA destinations, is idempotent on
`(manifest_id, revision)`, records source IDs in the append-only manifest
audit, and leaves the legacy table intact for compatibility reads.

Legacy image URLs that are not already an Experience asset reference are
explicitly reported in audit metadata for the asset-import path; they are not
invented into a checksum or exposed as an unsafe manifest asset. Unsupported
legacy action URLs are likewise not copied into the manifest.

## Domain separation

Experience manifests may reference a promo campaign for presentation, but do
not carry discount amount, eligibility, budget, tax, price or settlement
semantics. `promoEngine.ts` and the existing promo tables remain authoritative
for financial rule evaluation and redemption.

Runtime/platform feature flags are not copied into manifest JSON. The nested
`/app-experience/feature-flags` page reuses `FeatureFlags.tsx`, which still calls
the existing `/admin/feature-flags` API. The former `/feature-flags` UI route
redirects there, so the dashboard has one flag screen and one store.

## Cutover and precedence

The old `/banners` UI route redirects to `/app-experience/campaigns`, and the
legacy admin banner POST/PATCH/DELETE endpoints return `410
LEGACY_BANNER_WRITE_DISABLED`. The legacy GET and customer banner endpoint are
read-only compatibility surfaces; they cannot create a second live admin
source.

On Android, `ExperiencePresentationPolicy.shouldRenderLegacyGlobalBanner`
renders the legacy fallback only when the resolved manifest has no safe
sections. A resolved Experience manifest therefore has deterministic
precedence, and the two sources are never rendered together.
