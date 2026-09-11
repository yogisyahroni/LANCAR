# TEMBUS commerce component family — 2026

`DS-2026-004` defines the shared commerce anatomy used by organic and sponsored marketplace discovery.

## Canonical anatomy

`image + favorite action → merchant/menu identity → authoritative facts → independent offer → explicit action`

Customer Android and Customer Web expose the same TEMBUS concepts:

- `TembusMerchantCard` — organic discovery.
- `TembusSponsoredMerchantCard` — the same anatomy with a mandatory `Sponsored` disclosure owned by TEMBUS.
- `TembusRatingSummary`, `TembusEtaDistanceRow`, and `TembusPriceSummary` — factual detail rows.
- `TembusMenuItemCard`, `TembusPromoCard`, `TembusVoucherChip`, and `TembusCartBar` — menu, offer, and transaction-support primitives.

## Data provenance

`TembusMerchantCardModel` intentionally has no ad-label or campaign-copy field. The Food mapper reads merchant name, cover/menu media, rating, distance, open/closed, and halal status from `FoodMerchant`. ETA and delivery fee are rendered only when an authoritative quote supplies them; the card does not estimate either value locally.

Promo content is an independent `promoLabel`. It does not imply sponsorship, and sponsorship does not imply a merchant discount.

## Media and interaction rules

- Merchant images use a shared `4:3` aspect ratio and content description.
- Missing or failed media uses a deterministic neutral store placeholder; no emoji or invented food image is used.
- Long identity/address/copy is truncated with an ellipsis and bounded line count.
- Favorite controls use the TEMBUS 48dp/48px target and expose selected/pressed state plus an accessible name.
- Organic cards do not render ad disclosure. Sponsored cards always render `Sponsored`; merchant creative cannot suppress or replace it.
- Colors, surfaces, radii, and control states come from TEMBUS semantic tokens and the core component library.

## Adoption boundary

Food discovery now maps its existing server response through `toTembusMerchantCardModel` and selects the organic/sponsored wrapper from the server `is_sponsored` flag. Existing campaign impression/click recording remains in the Food ViewModel; the commerce component does not become an advertising source of truth.
