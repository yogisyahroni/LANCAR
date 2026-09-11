# LANCAR Design System — 2026

**Version:** `1.0.0`  
**Status:** Stable governance baseline  
**Owner:** LANCAR Design Systems Council  
**Effective date:** 2026-09-11  
**Reference:** [LANCAR Design System 2026 — Super App + Commerce Ads](https://www.figma.com/design/9JTlREMJNVkLYchQD1QcpV)

This document establishes one LANCAR-owned design system for Customer Android,
Customer Web, Merchant Android, Courier Android, and the Admin Dashboard. Figma
is the design reference; versioned code contracts, tests, and the component
registry are production truth.

## Release notes

### `1.0.0` — 2026-09-11

- Established the ten-layer LANCAR model: foundations, semantic tokens, core,
  commerce, logistics, emergency/service, Super-App, service-specific,
  monetization/sponsored, and accessibility/content rules.
- Adopted the existing WCAG-aware color contract, iconography contract, native
  surface themes, and protected transaction boundaries as governed foundations.
- Added the versioned component registry at
  `docs/design/component-registry-2026.json`.
- Added a machine-checkable review gate for remote App Experience component
  types at `scripts/design/validate-component-registry.mjs`.
- No existing color/theme behavior was rewritten. Benchmark-specific naming
  cleanup and component adoption remain tracked by `DS-2026-011`.

Future releases must list breaking changes, deprecated identifiers, migration
actions, and the first supported version for every new stable component.

## Governed layers

| Layer | Responsibility | Non-negotiable boundary |
| --- | --- | --- |
| Foundations | Color, type, spacing, radius, elevation, motion, sizing, icons, grid | Values are semantic and WCAG-aware; raw palette values are not feature-owned. |
| Semantic tokens | Roles such as action, text, surface, border, focus, status, scrim | Light/Dark/System map to one contract; a service may not invent an unreviewed primary color. |
| Core components | Buttons, fields, search, cards, badges, app bars, navigation, dialogs, loading and error states | States and accessible names are part of the component contract. |
| Commerce components | Product/merchant cards, price presentation, filters, basket, checkout summaries | Presentation cannot become the source of truth for price, payment, eligibility, or order state. |
| Logistics components | Tracking, ETA, route/parcel/courier state, proof and delivery status | Operational facts remain server-authoritative and are not altered by visual treatment. |
| Emergency/service components | Tambal Ban, Towing, urgent help, safety notices and recovery states | Calm, high-salience communication; no promotional distraction during active emergency work. |
| Super-App patterns | Home shell, service discovery, cross-service navigation, account and support | Shared foundations and semantics; service journeys own their domain density. |
| Service-specific patterns | Food, Paket, Ekspedisi, Tambal Ban, Towing, Merchant, Courier | A pattern can vary in journey and density, but cannot fork tokens, accessibility rules, or state semantics. |
| Monetization/Sponsored patterns | Platform promo, Merchant promo, sponsored placement and disclosure | Paid visibility is separate from organic ranking and authoritative commerce facts. |
| Accessibility/content rules | WCAG 2.1 AA, focus, keyboard/touch, names, alternatives, localization and content hierarchy | No required information relies on color alone; remote content is bounded and safely fallible. |

## Surface model

| Surface | Primary job | Density/pattern guidance | Owner |
| --- | --- | --- | --- |
| Customer Android | Super-App discovery and active customer journeys | Touch-first, clear hierarchy, calm transaction and emergency states | Customer Experience + Design Systems |
| Customer Web | Marketplace, order, support and account journeys | Responsive, keyboard-complete, readable at zoom and in both themes | Customer Web + Design Systems |
| Merchant Android | Operational merchant communication and actions | Dense enough for operations, never at the expense of names/focus/feedback | Merchant Experience + Design Systems |
| Courier Android | Delivery execution and operational status | Glanceable state, reliable recovery, strong status semantics | Courier Experience + Design Systems |
| Admin Dashboard | Governance, configuration, review and operations | Enterprise information density, explicit warnings, audit-friendly controls | Admin Platform + Design Systems |

The Admin Dashboard is the control plane and preview surface for runtime
components; it is not a permission to execute remote UI code or to re-theme
transaction screens.

## Source-of-truth order

1. Server-authoritative business, financial, order, eligibility, ETA,
   serviceability, availability, delivery-fee, and risk contracts.
2. Versioned LANCAR semantic token and component contracts in code.
3. The component registry and governance documents in this directory.
4. Figma reference and reviewed design artifacts.
5. Service implementation details, which may compose the system but may not
   redefine its foundations.

The registry is an inventory and review contract, not a replacement for runtime
schemas. Runtime App Experience remains restricted to the existing server
allowlist, per-surface allowlist, accessibility contract, safe property schema,
and native renderers.

## Monetization boundary

LANCAR Platform Promo, Merchant Promo, Sponsored Advertising, and Organic
Ranking are four different concepts and stores/contracts. Paid placement may
affect placement eligibility within an approved slot, but must never change:

- rating or review facts;
- ETA, serviceability, availability, or delivery fee;
- financial eligibility, price, payment, refund, payout, settlement, or tax;
- organic relevance, quality, or ranking facts.

Sponsored content must be disclosed, frequency-capped, safely fall back when
the ads path fails, and be absent from active transaction or emergency-critical
states where distraction or conflict would be harmful.

## Governance links

- [Design-system governance](design-system-governance.md)
- [Component lifecycle](component-lifecycle.md)
- [Service patterns](service-patterns.md)
- [Component registry](component-registry-2026.json)
- [Color token contract](color-token-contract.md)
- [Iconography contract](iconography-2026.md)
- [Web UI system](web-ui-system-2026.md)
