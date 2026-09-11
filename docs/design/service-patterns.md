# LANCAR Service Patterns

Service patterns express domain differences on top of one LANCAR foundation.
They may change journey, density, and information priority; they may not fork
semantic tokens, interaction semantics, accessibility rules, or authoritative
state.

## Shared foundation contract

All surfaces use the governed foundations and core semantics for:

- typography, color roles, spacing, radius, elevation, motion, sizing and
  focus;
- labels, accessible names, keyboard/touch behavior, loading, empty, error,
  disabled and recovery states;
- iconography, image alternatives, localization and content hierarchy;
- explicit separation of presentation from order, financial, risk, ranking,
  provider, and availability truth.

The current canonical contracts are linked from
`docs/design/lancar-design-system-2026.md` and the registry maps remote
component types to their code boundaries.

## Pattern matrix

| Domain | Journey priority | Allowed variation | Required invariant |
| --- | --- | --- | --- |
| Super-App Home | Discover services and resume relevant work | Service grouping and card density | Service meaning is labeled; active work is not obscured by promotion. |
| Food | Browse, compare, customize, and order | Richer media and marketplace discovery density | Organic relevance, availability, ETA, price, fee, and rating remain independent of paid placement. |
| Paket / Ekspedisi | Create, track, and understand delivery progress | Timeline/table density and carrier state detail | Tracking facts and carrier state remain explicit and recoverable. |
| Tambal Ban / Towing | Request urgent vehicle help and communicate safety state | Calm high-salience notices and constrained action hierarchy | No distracting ads in an active emergency flow; service status is authoritative. |
| Merchant | Manage incoming operational work and promotions | Dense operational cards and filters | Merchant Promo is not Sponsored Advertising and cannot mutate order truth. |
| Courier | Execute pickup, transit, and delivery steps | Glanceable status and recovery emphasis | Courier state machine and proof remain canonical; visual density cannot hide required actions. |
| Customer Web | Complete marketplace, order, support, and account journeys | Responsive layout and keyboard-complete controls | Works in Light/Dark/System without relying on color alone. |
| Admin Dashboard | Configure, review, audit, and operate the platform | Enterprise density, tables, filters, warnings, and previews | Remote App Experience is schema/preview bounded; transaction screens remain native-owned. |

## Composition rules

1. Start with an existing core component and compose a service pattern around
   its semantics.
2. Add a new component only through the governance gate and registry.
3. Keep data states visible with text and appropriate semantics; never encode a
   required distinction in color or icon shape alone.
4. Provide a safe empty/loading/error/offline fallback for any remote or
   asynchronous content.
5. Keep platform promo, merchant promo, sponsored placement, and organic
   ranking visibly and structurally distinct.

The design system owns shared meaning. A service owns only the domain-specific
composition and content needed to complete its journey.
