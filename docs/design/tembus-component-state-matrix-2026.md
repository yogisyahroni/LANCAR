# TEMBUS Core Component State Matrix — 2026

**Version:** `1.0.0`  
**Owner:** TEMBUS Design Systems Council  
**Scope:** Customer Android, Customer Web, Admin Dashboard; the same semantic
  API is available for Merchant/Courier adoption.

New component files use the application vocabulary `Tembus...`. The blueprint
uses “LANCAR” as the product-program label, but the application code and file
names remain TEMBUS.

## Component inventory

| Component | Android implementation | Web/Admin implementation | Semantic API |
| --- | --- | --- | --- |
| Button | `TembusButton` | `TembusButton` | `variant`, `state`, `size` |
| Icon button | `TembusIconButton` | `TembusIconButton` | `label`, `selected`, `enabled` |
| Text field | `TembusTextField` | `TembusTextField` | `label`, `state`, `errorText`, `supportingText` |
| Search field | `TembusSearchField` | `TembusSearchField` | visible label, search input semantics |
| Chip | `TembusChip` | `TembusChip` | `selected`, `enabled` |
| Card | `TembusCard` | `TembusCard` | semantic surface, optional click behavior |
| Badge | `TembusBadge` | `TembusBadge` | semantic tone, visible text |
| App bar | `TembusAppBar` | `TembusAppBar` | title, navigation, actions |
| Bottom navigation | `TembusBottomNavigation` | `TembusBottomNavigation` | selected page, label, icon |
| Modal | `TembusModal` | `TembusModal` | dialog name, modal semantics, dismiss |
| Toast | `TembusToastHost` | `TembusToast` | live status and optional action |
| Skeleton | `TembusSkeleton` | `TembusSkeleton` | loading semantics, decorative body |
| Empty state | `TembusEmptyState` | `TembusEmptyState` | heading, explanation, optional action |

## Required state matrix

| Component family | Default | Pressed/active | Hover | Focused | Selected | Disabled | Loading | Success | Warning | Error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Button | visible action | platform/native pressed feedback | Web hover | 3px/2px token focus ring | not applicable unless toggle | disabled attribute/opacity + readable text | spinner + disabled interaction | explicit success feedback | explicit warning feedback | error variant/state with text |
| Icon button | named icon action | platform/native pressed feedback | Web hover | visible focus ring | `selected`/`aria-pressed` | disabled attribute + cue | not applicable; use Button for async action | caller status | caller status | caller status |
| Text/Search field | label/value | input active | Web hover | focus-within ring | not applicable | disabled attribute + readable value | caller loading state | supporting success message | supporting warning message | `aria-invalid` + linked error |
| Chip | visible label | platform/native pressed feedback | Web hover | focus ring | `selected` + text/shape | disabled attribute | not applicable | caller status | caller status | caller status |
| Card | readable content | click feedback if interactive | Web hover if interactive | focus if interactive | caller semantics | caller semantics | skeleton composition | caller status | caller status | caller status |
| Badge/notice | visible text | not interactive | not applicable | not applicable | not applicable | not applicable | not applicable | success tone + text | warning tone + text | error tone + text |
| App bar/navigation | title/labels | item feedback | Web hover | focus ring | current page | disabled item | not applicable | caller status | caller status | caller status |
| Modal/toast | named surface | action feedback | Web hover | focus remains visible | not applicable | disabled action | caller state | caller message | caller message | alert message |
| Skeleton/empty | loading/empty explanation | not applicable | not applicable | not applicable | not applicable | not applicable | `role=status` or loading label | empty recovery | empty recovery | empty recovery |

## Acceptance contract

- Primary mobile controls have a minimum 48dp touch target. Web controls use a
  minimum 48px interactive height in the core API; dense layouts may change
  visual padding only through a reviewed pattern.
- Labels and error/supporting text are programmatically associated. Icon-only
  actions require a non-empty accessible label.
- Required distinctions are not conveyed by color alone; statuses include
  visible text and/or an appropriate semantic role.
- Light/Dark/System is inherited from the existing theme/token contract. Core
  components request semantic theme roles and do not accept arbitrary color,
  CSS, or Compose styling parameters.
- Loading disables duplicate activation and exposes a visible progress cue.
- Modal surfaces expose `role="dialog"`/native equivalent, an accessible title,
  and a deterministic dismiss path.
- Skeleton content is decorative; its container or page provides the loading
  announcement. Empty states explain what happened and offer recovery when a
  recovery action exists.
- Focus indicators use the existing WCAG-aware focus token and are not removed
  by a component API.

## Adoption boundary

This task establishes and verifies the reusable core API. Existing screen-local
components remain migration candidates for the adoption/regression work in
`DS-2026-011`; they are not silently rewritten here.
