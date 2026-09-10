# Admin Operations Style Guide — Enterprise Console

Admin is an operations console, not a marketing surface.

## Reference components

- solid background and raised-surface hierarchy;
- compact but readable tables, forms, filters and status chips;
- destructive actions use explicit verbs, confirmation and semantic error treatment;
- charts/maps support decisions and include a textual or tabular alternative;
- `glass-card` is solid by default; translucent treatment is opt-in for decorative media only;
- Light, Dark and System are explicit runtime modes and do not reset route, filters or drafts.

Admin login light/dark behavior is covered by `admin-dashboard/e2e/accessibility.spec.ts`. Operational route/state keyboard, zoom and assistive-technology review is tracked in `docs/accessibility/wcag-2.1-aa-web-checklist.md` and remains open until manually signed off.
