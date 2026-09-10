# LANCAR Web UI System — 2026

## Surface language

Customer Web uses **Modern Marketplace / Calm Utility UI**: warm-neutral solid surfaces, green primary actions, restrained orange accent, medium information density, soft elevation and rounded 8–12px geometry. Transparency is limited to decorative or marketing surfaces with a validated contrast layer.

Admin uses **Modern Enterprise Operations Console**: solid surfaces, compact-but-readable density, clear table/form/status hierarchy, minimal decoration, and explicit separation for destructive or high-risk actions.

Both surfaces share brand language, semantic color tokens, typography intent, Lucide functional icons and accessibility behavior. They do not share a forced layout or density.

## Reference component set

The reference set for both Light and Dark consists of:

- page background, surface, raised surface and dense data surface;
- primary, secondary, ghost, destructive and icon-only buttons;
- text input, select, textarea, checkbox, radio and switch;
- status badge, alert, toast, empty/loading/error/success state;
- navigation/sidebar, table, pagination, dropdown, modal/drawer and tooltip;
- campaign/banner surface and dynamic App Experience preview.

Every reference component must be checked across default, hover, active, selected, focus-visible, disabled, loading, error and success states before it is called migrated.

## Accessibility boundary

The color token checker is required before component migration. Keyboard/focus, semantic HTML, text spacing, responsive reflow, zoom and manual assistive-technology review remain separate acceptance gates; passing automation alone is not a WCAG sign-off.
