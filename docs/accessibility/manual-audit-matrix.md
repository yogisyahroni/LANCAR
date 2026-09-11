# LANCAR Manual WCAG 2.1 AA Audit Matrix

This matrix is the release-review queue for checks that browser automation cannot prove by itself. `PASS` is reserved for a dated manual observation; `NOT_RUN` is intentionally not a completion claim.

## Environment record — 2026-09-11

- Playwright Chromium is available and has produced the automated route/theme, semantic, focus, keyboard/state, dynamic-content, reflow and visual evidence referenced below. The current Customer inventory is `64/64` across 31 registered routes plus mobile-shell cases, Customer reflow/text-spacing coverage is `93/93`, focused Customer keyboard/runtime coverage is `16/16`, and focused Admin keyboard/theme/state coverage is `27/27`.
- The native CUA surface currently reports no browser or application handles. Windows `Narrator.exe` exists, but this execution environment has no authorized native UI/speech-output bridge to operate Narrator and capture an actual spoken review.
- The GitHub `staging` environment currently has no configured secrets or variables, so the repository workflow can verify/build/push but cannot deploy the current commit or run provider-backed release validation.
- Consequently, screen-reader rows and manual visual/keyboard rows remain `NOT_RUN` or `PARTIAL`; no automated result is promoted to manual `PASS`.

| Surface | Light | Dark | Keyboard/focus | Screen reader names | Empty/loading/error/success | Modal/dropdown/toast | 200% zoom | Dynamic content | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Customer public/auth | NOT_RUN | NOT_RUN | PARTIAL — login path automated | NOT_RUN | NOT_RUN | NOT_RUN | PARTIAL — login representative | NOT_RUN | OPEN |
| Customer authenticated portal | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | PARTIAL — orders representative | NOT_RUN | OPEN |
| Customer checkout / payment / provider states | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | OPEN |
| Admin login | PARTIAL — axe + visual baseline | PARTIAL — axe + visual baseline | PARTIAL — keyboard/focus automated | NOT_RUN | NOT_RUN | NOT_RUN | PASS — 640px equivalent | NOT_RUN | OPEN |
| Admin operational tables/modals | PARTIAL — axe route matrix | PARTIAL — axe route matrix | PARTIAL — collapsed sidebar only | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | OPEN |
| Admin charts/maps | PARTIAL — axe route matrix | PARTIAL — axe route matrix | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | OPEN |
| Admin App Experience editor/preview | PARTIAL — axe 80-case matrix | PARTIAL — axe 80-case matrix | PARTIAL — preview theme controls | NOT_RUN | NOT_RUN | NOT_RUN | PASS — approval 640px equivalent | PARTIAL — theme preview automated | OPEN |

## Evidence Boundaries

- Automated axe, reflow, zoom-equivalent and screenshot checks are recorded in the corresponding `docs/task-evidence/A11Y-2026-*.md` files.
- `NOT_RUN` items require a reviewer/date/route/viewport/assistive-technology record before they can move to `PASS`.
- No staging/provider-backed or production/manual result is inferred from local fixtures.

## Unblock procedure for remaining manual rows

1. Open the Customer and Admin staging URLs in an authorized interactive browser at the exact route/state listed in the matrix.
2. Capture Light and Dark screenshots at the stated viewport; inspect text/icon/control contrast, focus ring visibility, clipping, overlap and sticky surfaces.
3. Complete the primary action using keyboard only; record Tab order, Enter/Space behavior, Escape dismissal and focus restoration.
4. Run a real screen reader (Windows Narrator, NVDA or VoiceOver) and record the announced landmark, heading, form label, status/live region, dialog and action names.
5. Exercise empty/loading/error/success, modal/dropdown/toast and dynamic campaign/provider states, then record reviewer, date, browser, viewport, AT and result in `docs/task-evidence/A11Y-2026-012.md`.
6. Rerun the automated Customer/Admin inventory and evidence validator before changing any matrix or master checklist item to `PASS`/`[x]`.
