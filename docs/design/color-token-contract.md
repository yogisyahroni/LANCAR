# LANCAR web color-token contract — 2026

This is the shared semantic color contract for Customer Web and Admin Dashboard. The two surfaces use the same semantic vocabulary but may choose different density, layout and decorative treatment.

## Rules

- Every token has an explicit Light and Dark value.
- Content tokens are chosen as foreground/background pairs; white text is never assumed to be safe on a brand color.
- Normal text targets at least 4.5:1, large text at least 3:1, and required control boundaries/focus indicators at least 3:1.
- `border` is suitable for low-emphasis separation; `border-strong` and `input-border` are used when a boundary is necessary to perceive a control.
- `glass-card` is not a default Admin operational container. Critical and data-dense content uses solid semantic surfaces.
- Fixed brand artwork, carrier logos, map tiles and chart series are documented exceptions; ordinary application surfaces must use semantic tokens.
- `scripts/a11y/check-color-tokens.mjs` is the executable contrast guard and must fail on invalid protected pairs.

## Semantic token families

| Family | Purpose |
| --- | --- |
| `background`, `surface`, `surface-raised`, `surface-subtle` | page and container hierarchy |
| `foreground`, `foreground-secondary`, `foreground-muted` | primary, supporting and non-critical content |
| `border`, `border-strong`, `input-background`, `input-border` | separation and form controls |
| `focus-ring` | keyboard focus indicator |
| `primary` / `on-primary` | main action and its content |
| `accent` / `on-accent` | limited emphasis/promotion action |
| `success`, `warning`, `error`, `info` plus `on-*` and `*-surface` | status treatment with text/icon support |
| `selection`, `scrim` | selected content and modal/backdrop treatment |

The executable matrix contains the canonical hex values and checks 23 protected text, state, action and control-boundary pairs independently for Light and Dark. State text is measured against each tinted success/warning/error/info surface, and focus is measured against the subtle surface.

## Usage

Use semantic utilities such as `bg-background`, `bg-surface`, `bg-surface-raised`, `text-foreground`, `text-foreground-secondary`, `border-border`, `border-input-border`, `bg-primary`, `text-on-primary`, and `ring-focus-ring`. Do not introduce raw palette utilities for ordinary themed UI without documenting the exception.
