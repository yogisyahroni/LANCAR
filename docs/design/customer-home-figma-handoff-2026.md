# Customer Home — Figma handoff 2026

## Overview

Frame utama: `TEMBUS - Customer Home` in [ALL TEMBUS CUSTOMER](https://www.figma.com/design/nKUNTKLwAWj8AlWu74chfF/ALL-TEMBUS-CUSTOMER?node-id=0-1), Page 1. The frame is a 390px mobile composition with a vertically scrolling home surface and a persistent five-item navigation shell.

This document is a screen-composition handoff. Reusable primitives and semantic values remain governed by the stable TEMBUS library and `design-tokens/tembus.tokens.json`. Visual intent does not replace server-authoritative order, payment, price, ETA, availability, or notification data.

## Latest visual parity checkpoint — 2026-09-21

The authenticated local customer emulator now renders the Home composition against the attached Figma reference: light location/search shell, compact TEMBUS-Pay wallet bar, active-order card, 2×3 primary service grid, promo banner, nearby-food strip, and Indonesian five-item bottom navigation. The final screenshot is `customer-figma-home-final-id.png` and the matching accessibility tree is `customer-figma-home-final.xml` in the repository root.

Runtime values remain authoritative: location comes from the device, wallet balance from profile/payment state, active order from the order repository, and nearby food from the merchant contract. Voucher count is intentionally not invented because the current customer contract exposes no count field.

## Layout

- Canvas: 390px mobile width; content is vertical `Hug` height.
- Horizontal content gutter: `spacing-lg` (16px) for header, wallet, cards, and list sections.
- Primary section order: location/header → search → wallet → active/recent order → service grid → promo → quick repeat → nearby food → bottom navigation.
- Service grid: 2 rows × 3 columns with equal-width tiles and `spacing-sm`/`spacing-md` gaps.
- Primary services: `Kirim Paket`, `Agregator`, `Food`, `Tambal Ban`, `Towing`, `Lainnya`.
- Bottom navigation labels and route contract: `Beranda` → `dashboard`, `Aktivitas` → `history`, `Pesan` → `business`, `Notifikasi` → `notifications`, `Akun` → `profile`.

## Design tokens used

| Token | Usage |
| --- | --- |
| `global.spacing.lg` | screen gutter and card inner padding |
| `global.spacing.md` | section/row separation |
| `global.spacing.sm` | compact tile/icon spacing |
| `global.radius.md` / `global.radius.lg` | cards, service tiles, and grouped surfaces |
| `themes.*.color.background` | page background |
| `themes.*.color.surface` | wallet, order, merchant, and promo surfaces |
| `themes.*.color.primary` / `on-primary` | primary service/action emphasis |
| `themes.*.color.accent` / `on-accent` | high-energy promo and urgent action emphasis |
| `themes.*.color.foreground*` | readable text hierarchy |
| `themes.*.color.error`, `warning`, `success`, `info` | state communication; never color-only |

## Components and route mapping

| Figma composition | Existing implementation | Contract |
| --- | --- | --- |
| Location + branded header | `FigmaHomeHeader` in `DashboardHomeComponents.kt` | permission denied keeps a safe fallback label; notification action remains named |
| Search entry | `TembusSearchField`/dashboard search callback | opens `universal-search` |
| Wallet surface | `WalletCard` | balance must be runtime/profile-backed before showing an amount; no Figma sample number is business truth |
| Service grid | `TembusHomeServiceGrid` + `TembusHomeServiceTile` | `Agregator` opens `booking?open=aggregator`; `Lainnya` opens universal search; `Ambil Paket` remains secondary `pickup` intent |
| Active/recent order | dashboard order sections | status/ETA/order identity remain repository/server sourced |
| Food recommendation | `TembusFoodRecommendationStrip` | empty/error results collapse without fake merchants |
| Bottom navigation | `TembusBottomNavigation` | selected state is driven by route selection and exposes icon labels |

## States and interactions

| Surface | Required states | Behavior |
| --- | --- | --- |
| Header/location | default, loading, permission denied, stale/offline | show last known or safe fallback location; never imply precise location without permission |
| Search | default, focused, empty, no-result, offline | named search action; no decorative-only pill |
| Wallet | loading, available, unavailable/error | amount comes from profile/payment response; action affordances must not fabricate top-up/payment success |
| Service tile | default, pressed, disabled, unavailable | pressed feedback uses component state; disabled/unavailable keeps a visible explanation |
| Active order | loading, active, stale/offline, empty, error | only display order state returned by server/repository |
| Promo/recommendation | loading, populated, empty, error | sponsored/promo content remains disclosed and cannot override emergency/active-order priority |
| Bottom nav | selected, unselected, badge, disabled | route selection and badge count stay synchronized after cold start, deep link, and process recreation |

## Responsive behavior

| Width | Behavior |
| --- | --- |
| `< 600dp` | bottom navigation; single-column vertical scroll; tiles keep equal columns and readable labels |
| `600dp–1024dp` | existing navigation-rail behavior may replace bottom navigation; content remains bounded and does not stretch card text excessively |
| `> 1024dp` | preserve the same hierarchy with a readable max content width; do not create a second desktop-only information architecture |

## Content and edge cases

- Long location or customer names truncate with ellipsis while retaining the full accessible label.
- No order, no recommendation, and no banner are valid empty states; hide the section or show a concise recovery action.
- Slow network shows the existing recovery banner; stale data must be visibly distinguishable from current data.
- Food feature flag off removes Food from the runtime service list without breaking the remaining grid.
- If remote CMS service content is unavailable, the compiled safe service map remains the fallback; do not route an unknown service code blindly.
- Wallet amount, coins/rewards, order status, and ETA must never use sample values from Figma.

## Motion

- Use existing Compose/Material motion defaults for section and selected-navigation changes.
- Pressed state should be immediate and reversible; do not add decorative looping animation to emergency or transaction surfaces.
- Loading uses existing recovery/skeleton treatment where available; keep CTA disabled while the authoritative request is pending.

## Accessibility

- Every icon-only control has a visible or semantic label; service tiles expose their full service name.
- Five navigation items expose `label`, selected state, and notification badge semantics.
- Touch targets remain at least the existing platform minimum; do not shrink tiles to fit decorative spacing.
- Focus/order is header → search → wallet → services → orders → promo/recommendations → bottom navigation.
- Selected, disabled, error, SOS, and stale states use text/icon/shape in addition to color.
