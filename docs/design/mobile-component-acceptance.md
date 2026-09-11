# TEMBUS mobile component acceptance — 2026

This is the release contract for stable TEMBUS mobile components and remote
component types. It is evaluated against source, unit/compile checks, and a
device review when an authorized emulator/device is available.

## Acceptance matrix

| Area | Required proof | Current contract |
| --- | --- | --- |
| Theme | Light, Dark, and System resolve through the canonical theme/token source | `TembusTheme`, semantic token validator, and component color defaults are the source of truth. |
| Text | Font scale/dynamic text does not clip key labels or remove meaning | Text uses Material typography and bounded truncation only for repeated list content; long-copy review is part of design QA. |
| Touch | Primary mobile actions have a minimum 48dp target | `TembusButton`, `TembusIconButton`, `TembusChip`, and navigation items enforce the baseline. |
| Semantics | TalkBack name, role, selected, disabled, loading, and error states are explicit | Shared controls expose content descriptions/roles/selected/error semantics; native composition exceptions must preserve the same contract. |
| State | Default, pressed/active, focused, selected, disabled, loading, success, warning, error | `TembusControls`, `TembusSurfaces`, and `TembusStates` define the state vocabulary. |
| Resilience | Loading, error, empty, and offline/retry states remain usable | Screen contracts use shared state primitives or document a domain-specific equivalent. |
| Localization | Long Indonesian/English labels and RTL layout do not change business meaning | Strings are externalized where available; layout uses semantic flow and localization QA checklist. |
| Remote components | Design-system and accessibility approval precede allowlist publication | Component registry validator is the gate; server schema, client sanitizer, renderer, and registry must move together. |

## Device review protocol

When an authorized device is available, review the customer home, food
discovery, merchant detail, and one service/emergency surface in Light, Dark,
and System mode; set a large font scale; navigate by TalkBack; exercise
loading/error/empty/offline states; and capture only non-sensitive screenshots.
No OTP, payment credential, or provider secret is needed for this review.
