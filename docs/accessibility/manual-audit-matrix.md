# LANCAR Manual WCAG 2.1 AA Audit Matrix

This matrix is the release-review queue for checks that browser automation cannot prove by itself. `PASS` is reserved for a dated manual observation on the named surface; `PARTIAL` records a real but narrower observation; `NOT_RUN` is intentionally not a completion claim.

## Environment record — 2026-09-11

- Device staging is reachable through the active Cloudflare tunnel: Customer `https://app.bawain.my.id`, Admin `https://admin.bawain.my.id`, API health `https://api.bawain.my.id/health`. Public HEAD probes returned HTTP `200` for all five configured surfaces, including the landing domain.
- The Docker stack was rebuilt with the current Customer frontend and returned to running/healthy state. The current local runtime generated all 29 Customer routes; the combined Docker suites pass Customer `266/266` and Admin `470/470`.
- Manual spot checks used the Codex in-app browser at a compact viewport of approximately `600x898`. The available surface exposed an accessibility tree and screenshots, but no native spoken screen-reader output bridge. The observed manual color scheme was dark/system; changing to a real light-mode browser session was not available through this surface.
- OTP, real payment-provider execution and other external-provider callbacks were intentionally deferred per the task instruction. No credential or secret was entered or recorded.

| Surface | Light | Dark | Keyboard/focus | Screen reader names | Empty/loading/error/success | Modal/dropdown/toast | 200% zoom | Dynamic content | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Customer public/auth | PARTIAL — automated Light matrix is green; dated manual Light visual session unavailable | PARTIAL — dated tunnel spot checks on `/`, `/login`, `/cek-resi`, callback/error routes; no overflow observed | PARTIAL — 22-stop Tab traversal on `/`; empty login submit and post-fix tracking-input focus verified | PARTIAL — browser AX tree exposed headings, landmarks, labels and named actions; spoken output NOT_RUN | PARTIAL — empty login, empty tracking, 401 tracking error, inactive tracking/callback/location states; success NOT_RUN | PARTIAL — no public modal exercised; locale select identified but not opened | PARTIAL — automated 320/640 CSS-width proof; actual browser zoom NOT_RUN | NOT_RUN — provider/campaign variant not exercised | OPEN |
| Customer authenticated portal | NOT_RUN — no authorized staging session | NOT_RUN — no authorized staging session | NOT_RUN — authenticated primary actions not traversed manually | NOT_RUN | NOT_RUN — fixture-backed automation only | NOT_RUN | PARTIAL — automated equivalent only | NOT_RUN | OPEN |
| Customer checkout / payment / provider states | DEFERRED — external payment scope | DEFERRED — external payment scope | DEFERRED — external payment scope | NOT_RUN | DEFERRED — OTP/payment provider coordination required | NOT_RUN | NOT_RUN | DEFERRED — provider-backed state | OPEN / deferred external |
| Admin login | PARTIAL — automated Light proof; manual Light session unavailable | PASS — dated `/login` tunnel screenshot/AX spot check at compact viewport | PASS — manual Tab sequence reached email, password, remember-me, forgot-password and submit with visible focus | PARTIAL — AX tree exposed login names; spoken output NOT_RUN | PASS — empty submit produced native `Please fill out this field.` and focused email | NOT_RUN | PARTIAL — automated 640 CSS-width proof; actual browser zoom NOT_RUN | NOT_RUN | OPEN |
| Admin operational tables/modals | NOT_RUN — authenticated manual session unavailable | NOT_RUN — authenticated manual session unavailable | NOT_RUN | NOT_RUN | NOT_RUN — automated fixture coverage only | NOT_RUN | PARTIAL — automated equivalent only | NOT_RUN | OPEN |
| Admin charts/maps | NOT_RUN — authenticated manual session unavailable | NOT_RUN — authenticated manual session unavailable | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | PARTIAL — automated equivalent only | NOT_RUN | OPEN |
| Admin App Experience editor/preview | NOT_RUN — authenticated manual session unavailable | NOT_RUN — authenticated manual session unavailable | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | PARTIAL — automated approval/preview equivalent only | PARTIAL — automated theme/media variants only | OPEN |

## Registered route/state inventory

The automated inventory is generated from the repository route arrays and is kept in sync with the current `page.tsx` surfaces.

### Customer — 31 registered routes

`/`, `/login`, `/daftar`, `/forgot-pin`, `/otp-verify`, `/google-callback`, `/apple-callback`, `/cek-resi`, `/track/invalid`, `/pay/fixture-payment`, `/location-requests/fixture-token`, `/dashboard`, `/orders`, `/orders/new`, `/orders/new/food`, `/orders/new/ondemand`, `/orders/new/aggregator`, `/orders/bulk`, `/orders/fixture-order`, `/resi`, `/resi/fixture-resi`, `/payment-links`, `/profil`, `/alamat`, `/disputes`, `/notifikasi`, `/voucher`, `/products`, `/laporan`, `/analytics`, `/feature-flags`.

Representative states covered by the current manual/automated evidence: landing/public, auth and callback errors, tracking empty/error/inactive-link, authenticated dashboard/order creation/history/detail, On-Demand and Aggregator paths, payment-link route, profile/address/dispute/notification/product/report/analytics/feature-flag routes, loading semantics, responsive 320/640 CSS widths, text-spacing overrides, keyboard/dialog/popover behavior and runtime campaign media fixtures.

### Admin — 80 registered routes

The full list is the `FULL_ADMIN_ROUTE_INVENTORY` in `admin-dashboard/e2e/accessibility.spec.ts`. It spans dashboard; orders/exceptions; business API requests; couriers/merchant/customer operations; HR; news/analytics/reports; finance/tax/chart-of-accounts/tariffs/settlements; payment links; zones/meeting points/warehouse; vouchers/promos/notifications/broadcasts; feature flags/experiments; all App Experience editors, preview, approval, revisions, scheduling and analytics; localized content/release policies; audit, agreements, settings, resi templates, discounts, maps runtime and market configuration.

## Evidence boundaries

- Automated axe, route semantics, focus-style, reflow, text-spacing, CSS 200%-equivalent, visual and runtime-state checks are recorded in `docs/task-evidence/A11Y-2026-012.md`.
- The dated manual observations above are intentionally scoped to routes/states actually opened through the device tunnel. They do not promote an entire route family to `PASS`.
- `NOT_RUN` items require a reviewer/date/route/viewport/assistive-technology record before moving to `PASS`.
- No staging/provider-backed or production result is inferred from local fixtures. The device tunnel is real runtime reachability evidence; it is not proof of the GitHub SSH deployment workflow or external-provider behavior.

## Unblock procedure for remaining manual rows

1. Use an authorized staging account or an owner-provided non-secret test session to reach authenticated Customer and Admin routes. Do not paste credentials into chat or evidence.
2. Open each representative route in a real browser with Light and Dark color schemes; record screenshot, route, state, viewport and browser.
3. Complete each primary action with keyboard only; record Tab order, Enter/Space behavior, Escape dismissal and focus restoration.
4. Run Windows Narrator, NVDA or VoiceOver and record announced landmarks, headings, form labels, status/live regions, dialogs and action names.
5. Exercise empty/loading/error/success, modal/dropdown/toast and dynamic campaign/provider states. OTP/payment-provider rows remain deferred until the external coordination is complete.
6. Rerun the Customer/Admin automated suites and `python scripts/tasks/validate_task_evidence.py` before promoting any matrix or master-checklist item to `PASS`/`[x]`.
