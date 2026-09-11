# TEMBUS Figma library governance and code traceability — 2026

The current visual reference is the [TEMBUS/LANCAR Figma file](https://www.figma.com/design/9JTlREMJNVkLYchQD1QcpV). The repository contract for its stable library is `tembus-component-catalog-2026.json`; this keeps component names, semantic variants, usage boundaries, accessibility notes, and implementation review references auditable in version control.

## Library structure

The stable library is organized into the three required pages:

1. `Foundations & Components` — tokens, core controls, surfaces, navigation,
   dialogs, and state primitives.
2. `Customer Super-App Patterns` — Home/navigation, service identity,
   logistics, emergency, and cross-service compositions.
3. `Commerce Ads & Merchant` — organic commerce, merchant promotion, and
   disclosed sponsored patterns.

The catalog uses the stable component reference format `Tembus/<Component>`.
The Figma page and component reference are linked to the implementation task
and commit reference that introduced the code contract. Future material UI
reviews should add a specific Figma node URL when the design review creates a
node-level decision; the component reference remains the stable library
identity.

## Naming and variant rule

Figma names map to the application API without benchmark-specific aliases:

| Figma reference | Code role | Semantic variant/props |
| --- | --- | --- |
| `Tembus/Button` | `TembusButton` | `variant`, `state`, `size` |
| `Tembus/IconButton` | `TembusIconButton` | `label`, `selected`, `enabled` |
| `Tembus/TextField` | `TembusTextField` | `label`, `state`, `errorText`, `supportingText` |
| `Tembus/SearchField` | `TembusSearchField` | label and search semantics |
| `Tembus/Card` | `TembusCard` | semantic surface, interactive state |
| `Tembus/MerchantCard` | `TembusMerchantCard` | merchant facts, availability, media |
| `Tembus/SponsoredMerchantCard` | `TembusSponsoredMerchantCard` | sponsored disclosure and merchant facts |
| `Tembus/ServiceIdentityCard` | `TembusServiceIdentityCard` | title, subtitle, icon, tone, priority |
| `Tembus/CarrierRateCard` | `TembusCarrierRateCard` | provider, ETA, price, availability, selected |

The machine-checkable catalog contains the complete mapping, including code
paths and review references for each stable entry.

## Review and Code Connect policy

Material UI changes must update the catalog in the same task/PR and record:

- the Figma page/component reference;
- the stable code role and semantic props;
- usage, do-not-use, and accessibility notes;
- affected implementation paths and task/commit reference;
- fallback and source-of-truth boundaries when the component can render remote
  content.

Code Connect is deliberately `deferred_until_api_stable`. A temporary mock or
one-off screen implementation must not be connected to the library. Once an
API is stable and a design review has an appropriate node-level reference,
Code Connect can be added in a separate reviewed change.

## Source-of-truth and accessibility boundary

Figma communicates visual intent. It cannot override server-authoritative
price, payment, order, eligibility, ETA, availability, ranking, or risk facts;
the versioned component/token contract remains the implementation boundary.
Figma also cannot remove accessible names, focus indicators, touch/keyboard
targets, localization requirements, reduced-motion behavior, or fallback
states. The catalog points to the code and acceptance contracts that enforce
those rules.

## Verification

Run:

    node scripts/design/validate-tembus-figma-traceability.mjs
    node scripts/design/validate-component-registry.mjs

The first command verifies the stable Figma page/component vocabulary, code
paths, semantic props, review references, and deferred Code Connect policy.
The second verifies remote App Experience registry/schema/allowlist parity.
