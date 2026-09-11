# LANCAR Responsive and Reflow Matrix

This is the execution sheet for the 320px / 400% zoom accessibility gate. It is intentionally evidence-oriented: a route is `PASS` only after interaction and content reflow are observed.

| Route/surface | 320px | 200% zoom equivalent | 400% zoom equivalent | Horizontal scroll limited to data tables | No clipped primary action | Status |
| --- | --- | --- | --- | --- | --- |
| Customer registered route inventory (31 routes) | PASS — 31/31 at 320px | PASS — 31/31 at 640px CSS equivalent | NOT_RUN | N/A | PASS — body remains inside viewport; no page errors | PARTIAL |
| `/` and public auth | PASS — included in Customer 31/31 inventory | PASS — included in Customer 31/31 inventory | NOT_RUN | N/A | PASS — primary control stays inside viewport | PARTIAL |
| Portal navigation, order creation, history, payment, profile and operational pages | PASS — included in Customer 31/31 inventory | PASS — included in Customer 31/31 inventory | NOT_RUN | N/A | PASS — shell remains inside viewport | PARTIAL |
| Public tracking and checkout forms | PASS — included in Customer 31/31 inventory | PASS — included in Customer 31/31 inventory | NOT_RUN | N/A | PASS — route remains inside viewport | PARTIAL |
| Admin registered route inventory (70 routes) | PASS — 70/70 at 320px | PASS — 70/70 at 640px CSS equivalent | NOT_RUN | PASS where `overflow-x-auto` is present | PASS — main surface remains inside viewport; no page/runtime errors | PARTIAL |
| Admin App Experience, Finance, Risk, Logistics and Settings groups | PASS — included in Admin 70/70 inventory | PASS — included in Admin 70/70 inventory | NOT_RUN | PASS where data tables require it | PASS — route remains inside viewport | PARTIAL |

The implementation contract is: use responsive stacks for controls and cards, keep only genuinely tabular data horizontally scrollable, and never hide a required action below a clipped or fixed overlay.

Text-spacing inventory evidence: Customer `31/31` and Admin `70/70` registered routes pass the WCAG 1.4.12 override at 320px with no page/runtime errors or unexpected document-level horizontal overflow. These automated checks do not replace manual modal, sticky, assistive-technology, actual browser zoom, 400% zoom, or long-localized-string review.
