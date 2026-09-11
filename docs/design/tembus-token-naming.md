# TEMBUS semantic token contract

This document defines the canonical token vocabulary for the TEMBUS design
system. The source of truth is `design-tokens/tembus.tokens.json`; CSS,
Customer Web, Admin Web, and Android values are generated or checked against
that source.

## Naming and mapping

Token names describe semantic role and usage, never a raw hue or component
owner. The mapping is deliberately traceable across Figma and code:

| Figma role | Canonical JSON | Web/Admin CSS | Android mapping |
| --- | --- | --- | --- |
| `color/background` | `color.background` | `--token-background` | `Background` / `DarkBackground` |
| `color/surface` | `color.surface` | `--token-surface` | `Surface` / `DarkSurface` |
| `color/text/primary` | `color.foreground` | `--token-foreground` | `OnBackground` / `DarkOnBackground` |
| `color/text/secondary` | `color.foreground-secondary` | `--token-foreground-secondary` | `OnSurfaceVariant` / `DarkOnSurfaceVariant` |
| `color/action/primary` | `color.primary` + `color.on-primary` | `--token-primary` + `--token-on-primary` | `Primary` + `OnPrimary` |
| `color/action/accent` | `color.accent` + `color.on-accent` | `--token-accent` + `--token-on-accent` | `Accent` + `OnAccent` |
| `color/status/*` | `color.success|warning|error|info` | `--token-*` | `Success|Warning|Error|Info` |
| `size/min-touch-target` | `size.min-touch-target` | `--token-size-min-touch-target` | `TembusComponentDefaults.MinTouchTarget` |

Figma aliases and component variants must reference these semantic roles. A
new service may not add a second `primary-green`, `brand-orange`, or screen
specific token without a design-system review and a documented transform.

## Units and themes

- Web/Admin outputs use CSS pixels and CSS custom properties.
- Android uses density-independent `dp` for geometry and scalable typography
  remains in `sp`; the canonical 48px web target maps to the 48dp mobile
  baseline.
- `light` and `dark` are explicit theme outputs. `system` is a runtime choice
  between those two complete semantic maps, not a third palette.
- Motion tokens must collapse to `0ms` under reduced-motion preferences.

## Protected accessibility pairs

The `wcagProtectedPairs` list in the canonical JSON is executable. It covers
normal text at 4.5:1, essential component boundaries and focus indicators at
3:1, and tinted status surfaces in both themes. `on-*` values are chosen from
the measured pair rather than assuming white text is safe.

## Change procedure

1. Edit `design-tokens/tembus.tokens.json` and document the Figma role/path.
2. Run `node scripts/design/export-tembus-design-tokens.mjs` to refresh the
   checked-in CSS and TypeScript outputs.
3. Run `node scripts/design/validate-tembus-design-tokens.mjs` and the Android
   accessibility source guard.
4. Review protected-pair output and update component/evidence documentation
   when a semantic role changes.

Generated files are not a license to bypass the semantic contract; product
components must still consume roles, variants, and states rather than raw
colors.
