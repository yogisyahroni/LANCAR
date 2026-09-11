# TEMBUS Home composition standard — 2026

`DS-2026-006` makes the Home surface a service-aware super-app entry point,
not a Food-only landing page.

## Information hierarchy

1. Identity/context and a universal search entry point.
2. Active orders and recovery information when present.
3. Utility context such as wallet.
4. The primary TEMBUS service grid.
5. Platform-owned campaign/promo and contextual discovery.
6. Bounded paid inventory only when the App Experience allowlist permits it.
7. Additional organic modules and navigation.

`IncomingPackagesSection` is rendered before wallet, service discovery, and
campaign modules. Its tracking/chat actions stay attached to authoritative
order state, so a recoverable transaction cannot be visually outranked by
monetization.

## Universal search

The Home search pill opens `TembusUniversalSearchScreen`. Query terms resolve
only to compiled, service-aware destinations (`pickup`, `food_delivery`,
`aggregator`, `tambal_ban`, or `towing`). An unknown query produces a safe empty
state and never constructs an arbitrary deep link.

## Naming and semantics

- Benchmark-specific `GojekTopBar`, `GojekServiceGrid`, and
  `GojekServiceTile` names were replaced by `TembusHomeTopBar`,
  `TembusHomeServiceGrid`, and `TembusHomeServiceTile`.
- Service icons are exposed through `TembusServiceIcons` and
  `getTembusServiceIcon` for App Experience and native Home rendering.
- Tile appearance uses semantic service tones mapped to Material theme roles;
  the component API does not accept arbitrary colors.

## Server configuration boundary

Dynamic Home sections continue to pass through `DynamicHomeRenderer`'s
compiled `RENDERABLE_COMPONENTS` allowlist and authoritative enabled service
intersection. Unknown components are skipped and reported; remote content
cannot inject arbitrary native/WebView UI or bypass navigation policy.

Paid modules remain bounded by the existing App Experience contract and later
Ads inventory rules. This task does not introduce a new ad source of truth.
