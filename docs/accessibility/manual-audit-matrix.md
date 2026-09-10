# LANCAR Manual WCAG 2.1 AA Audit Matrix

This matrix is the release-review queue for checks that browser automation cannot prove by itself. `PASS` is reserved for a dated manual observation; `NOT_RUN` is intentionally not a completion claim.

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
