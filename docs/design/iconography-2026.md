# LANCAR Iconography Contract — 2026

Lucide React is the single default functional icon family for Customer Web and Admin Dashboard. Icons communicate a known action, state, or service; they do not replace the visible label when the meaning could be ambiguous.

## Service mapping

| Service kind | Canonical icon | Required label |
| --- | --- | --- |
| Paket instan / last-mile | `Package` | Paket Instan |
| Food delivery | `UtensilsCrossed` | Food delivery |
| Ekspedisi aggregator | `Truck` | Ekspedisi Antar-Kota |
| Towing | `CarFront` | Towing |
| Tambal ban / bantuan kendaraan | `Wrench` | Tambal ban or resolved service name |
| Unknown service | `CircleHelp` | Layanan belum teridentifikasi |

The shared `serviceIcon.ts` mapping is used by both the Customer marketing service cards and `OrderServiceBadge.tsx`. It renders the service label beside the icon and keeps the first-mile/external-carrier relationship textual, so color or icon shape is never the only channel.

## Interaction rules

- Icon-only buttons must have an accessible name through `aria-label`, a visible tooltip, or an associated text label.
- Decorative icons use `aria-hidden="true"`; status icons accompany text and are not the sole status signal.
- This contract is enforced in source by `scripts/a11y/check-iconography.mjs` for direct Lucide tags, dynamic icon render sites and raw SVG boundaries; chart SVGs remain covered by their chart accessibility contract.
- Use `focus-visible` styles from the shared token contract. Do not remove the focus indicator to make an icon button visually quieter.
- Use one icon family and consistent sizing: `h-4 w-4` for inline actions, `h-5 w-5` for navigation/actions, and larger sizes only for empty/error state illustrations.
- Do not use emoji or a second icon package for functional UI without a documented exception.

The current raw-SVG and SVG-brand-asset exception inventory is machine-checked by
`scripts/a11y/check-iconography-exceptions.mjs` against
`docs/design/iconography-exceptions-2026.json`. New raw SVGs or application SVG asset references
must add a rationale and accessible contract to that manifest before they can pass CI.

## Exceptions

Brand artwork, carrier logos, map-provider markers and data-visualization glyphs are rendering-boundary exceptions. They must retain their provider/brand geometry and still provide an accessible label or textual alternative.
