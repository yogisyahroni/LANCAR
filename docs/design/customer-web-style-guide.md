# Customer Web Style Guide — Calm Utility Marketplace

Customer Web is a warm-neutral marketplace surface for transactional clarity.

## Reference components

- solid page/background/surface hierarchy;
- green primary CTA with `on-primary` content;
- orange accent only for emphasis and promotion;
- 8–12px control geometry and consistent medium-density spacing;
- labelled forms, status icon + text, and visible focus rings;
- decorative media may use a validated overlay, but checkout/order information stays on solid surfaces.

Light and Dark reference states are represented by the public theme-matrix routes in `frontend/e2e/accessibility.spec.ts`: landing, login, registration and tracking. The automated matrix proves the representative public surfaces are free of axe WCAG 2.1 AA violations; the manual authenticated-route audit remains a separate release gate.
