# LANCAR Design System Governance

This is the operating policy for the governed LANCAR design system described in
`lancar-design-system-2026.md`. It applies to all five supported surfaces and
to any component type that can be referenced by remote App Experience.

## Ownership

| Decision | Accountable owner | Required reviewers |
| --- | --- | --- |
| Foundations and semantic tokens | Design Systems Council | Accessibility, Web, Android, Admin |
| Core and service component semantics | Design Systems Council | Owning service team, Accessibility |
| Runtime App Experience component types | Experience Platform | Design Systems, Accessibility, Security |
| Commerce/transaction presentation | Owning domain team | Design Systems, Risk/Payments when relevant |
| Sponsored/monetization patterns | Ads Platform | Design Systems, Organic Ranking, Privacy/Risk |
| Admin control-plane presentation | Admin Platform | Design Systems, Accessibility, Security |

The accountable owner must be named in the registry before a component can be
promoted to `stable`. Team ownership does not grant permission to alter a
server-authoritative domain contract.

## Component review gate

Adding a component type is a governed change, not a local UI convenience. The
same pull request must contain the registry entry and the implementation or
contract change it describes.

1. Propose a unique LANCAR identifier and add a registry entry with owner,
   lifecycle status, surfaces, accessibility contract, and code mapping.
2. Describe the component's semantic role, states, content rules, fallback,
   and relationship to existing core/service components. Reuse an existing
   component when the semantics already fit.
3. Review tokens, interaction states, touch/keyboard target, accessible name,
   non-text alternative, localization, and reduced-motion behavior.
4. If the type is remotely addressable, update the server schema, per-surface
   allowlist, accessibility contract, client sanitizer, and native/web
   renderer together. Remote code, arbitrary CSS, arbitrary fonts, protected
   transaction fields, and unsafe destinations remain prohibited.
5. Run `node scripts/design/validate-component-registry.mjs`. The check fails
   when the registry and the remote App Experience contract drift, when a
   required metadata field is missing, or when a mapped file does not exist.
6. Keep the entry `experimental` until the owning surfaces have the required
   renderer/state coverage. Promote to `stable` only after the owning task has
   its local evidence and regression checks.

This validator is the repository gate for a new remote App Experience
component type. A type cannot be added to the server allowlist without the
registry and accessibility contract being updated in the same change.

## No mini design systems

Food, Towing, Tambal Ban, Paket, Ekspedisi, Merchant, and Courier teams may
create service patterns, but may not create a parallel token vocabulary,
primitive library, icon family, state model, or accessibility exception list.

Allowed:

- a service-specific composition of governed primitives;
- journey-specific density, information priority, and content hierarchy;
- domain-specific status data when its semantics remain explicit and
  server-authoritative.

Not allowed:

- a service-owned “primary green/orange” or raw color palette;
- duplicate Button/Card/Field/Badge semantics with different focus/error rules;
- emoji or random SVG as a functional replacement for the approved icon and
  illustration contract;
- a marketing component that can write or imply price, rating, ETA,
  serviceability, availability, fee, or financial eligibility.

## Review record

Every change must identify:

- the design-system version and affected registry entries;
- whether the change is additive, breaking, or deprecating;
- affected surfaces and the fallback for unsupported clients;
- accessibility and content decisions;
- test/evidence paths and release follow-ups.

The master blueprint remains the acceptance source for TASK-IDs. This document
sets the gate and vocabulary; it does not silently create new product scope.
