# LANCAR Web Accessibility — WCAG 2.1 AA Checklist

Status: automated checks implemented; manual audit items remain `NOT_RUN` until a reviewer records the date, route, viewport, assistive technology and result.

## Automated gates

- Customer public routes (`/`, `/login`, `/daftar`, `/cek-resi`) are scanned with axe-core in explicit light/dark and System-resolved light/dark modes by `frontend/e2e/accessibility.spec.ts`.
- Admin login plus representative high-risk operational/App Experience routes are scanned with axe-core in explicit light/dark and System-resolved light/dark modes by `admin-dashboard/e2e/accessibility.spec.ts`.
- Admin Light/Dark login and empty-dashboard reference surfaces are checked with Playwright screenshot baselines by `admin-dashboard/e2e/visual-regression.spec.ts`; the production Admin build job runs this visual gate.
- Customer reflow checks cover the full registered 27-route inventory at 320px and 640px CSS (200%-equivalent); Admin covers the full registered 70-route inventory at both widths. Full Customer 27-route and Admin 70-route text-spacing inventories also run at 320px. These automated checks still do not replace manual modal/sticky, assistive-technology, actual browser zoom, 400% zoom or long-localized-string review.
- CI invokes the customer scan in staging and production E2E jobs. The admin package exposes `npm run test:e2e:a11y` for the Admin build gate.
- Semantic token contrast is checked by `node scripts/a11y/check-color-tokens.mjs`.
- Raw palette/arbitrary theme classes are checked by `node scripts/a11y/check-theme-hardcoded-classes.mjs`.

## Manual acceptance matrix

| Surface | Keyboard-only | Focus visibility/order | Screen reader names | Reflow at 320px | Reduced motion | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Customer public routes | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | OPEN |
| Customer authenticated portal | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | OPEN |
| Customer checkout/forms | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | OPEN |
| Admin login | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | OPEN |
| Admin operational tables/modals | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | OPEN |
| Admin App Experience editor/preview | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | OPEN |

## Reviewer record

Record each completed row in the corresponding task evidence with:

- date and reviewer;
- exact route and state (empty, loading, error, success, modal);
- viewport and browser/assistive technology;
- observed issue, severity and linked fix;
- retest result.

No manual result may be inferred from the automated axe scan.
