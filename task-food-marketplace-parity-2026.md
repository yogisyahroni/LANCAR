# Task — Food Marketplace 2026 Parity & End-to-End Hardening

**Status:** OPEN  
**Priority:** P0 → P2  
**Baseline branch:** `staging`  
**Scope:** Customer Android, Merchant Android, Courier Android, Order Service, Merchant Service, Payment, Routing, Notifications, Observability, QA  
**Benchmark references:** Uber Eats, GrabFood, GoFood, ShopeeFood — benchmark functional/operational patterns only; do not clone proprietary UI.

## Objective

Bring LANCAR Food from a strong feature-complete beta foundation to a production-grade marketplace flow where customer address/pricing/ETA, merchant preparation, courier dispatch/handoff, payment/refund, and realtime state transitions are consistent, idempotent, auditable, and safe under retries and failure scenarios.

## Release Gate

Do **not** treat Food as production-ready until every P0 item is complete and automated end-to-end contract tests are green for customer → merchant → courier → payment/refund flows.

---

## P0 — Production Blockers

### FOOD-2026-001 — Coordinate-safe food checkout

**Problem**  
The checkout UI can display/select a delivery address while order submission still uses the FoodViewModel browsing/current-location latitude/longitude. Address text and courier destination can diverge.

**Required**
- Model a selected delivery destination as one atomic object: address id/text + latitude + longitude + city/postal code + receiver metadata.
- Selecting a saved address must replace both display address and coordinates.
- Manual address entry must be geocoded or confirmed through a map/pin before checkout.
- Never silently reuse merchant-discovery/current-location coordinates as delivery coordinates.
- Remove production reliance on hardcoded/default Jakarta coordinates for order placement.
- Block order creation if destination coordinates are missing, stale, outside service area, or do not correspond to the selected address.
- Show a final destination/pin confirmation before placing the order.

**Acceptance criteria**
- Saved address A always creates an order with A's coordinates.
- Changing to address B updates price/ETA and creates the order with B's coordinates.
- Manual address without resolved coordinates cannot be submitted.
- Automated tests cover current location, saved address, manually pinned address, stale location, permission denied, and out-of-range address.

### FOOD-2026-002 — Authoritative pre-order Food Quote

**Problem**  
Customer should see the authoritative amount before committing to an order/payment. Food pricing is already server-authoritative during order creation, but the flow needs an explicit quote contract.

**Required**
- Add `POST /api/v1/orders/food/quote` or equivalent.
- Quote must validate merchant availability, item/variant availability, quantities, voucher eligibility, delivery radius, taxes/fees, and selected destination.
- Return `quote_id`, subtotal, variant additions, delivery fee, platform/service fee, tax, discount, final total, currency, expiry, and ETA range.
- Create-order consumes a valid quote or recomputes and requires explicit reconfirmation when material price/availability changes.
- Never trust client-calculated prices.

**Acceptance criteria**
- Checkout total equals server quote.
- Expired/stale quote cannot silently create an order at a different total.
- Price/stock/voucher changes return a typed recoverable response for customer reconfirmation.

### FOOD-2026-003 — Idempotent Food order creation

**Required**
- Require an idempotency key for create-order.
- Persist request fingerprint + result for the idempotency window.
- Same key + same request returns the original order.
- Same key + conflicting request is rejected.
- Protect against double tap, timeout retry, socket reconnect, HTTP retry, and duplicate payment callback.

**Acceptance criteria**
- Replaying the same request 10× produces exactly one order and one financial obligation.
- Duplicate payment/webhook events cannot duplicate ledger entries or dispatch.

### FOOD-2026-004 — Enforce secure merchant → courier/customer handoff

**Problem**  
Food order creation already generates a handover token/QR, but the audited pickup/scan contract does not require that token. Generation without verification does not secure handoff.

**Required**
- Add an explicit handoff verification endpoint/command for food delivery and customer Pickup.
- Merchant displays/controls one-time PIN/QR; assigned courier/customer verifies it before pickup completion.
- Verification must bind order, merchant, assigned courier/customer, expiry, attempt count, and current allowed state.
- Consume token once; reject replay, wrong actor, wrong order, expired token, excessive failed attempts.
- Transition to `picked_up` atomically with verification and audit log.
- Define controlled support override requiring reason + actor + audit trail.

**Acceptance criteria**
- Courier cannot mark a food order picked up without successful handoff verification except audited override.
- Replayed token fails.
- Wrong courier/order/token fails.
- Merchant, customer and courier receive consistent state after verification.

### FOOD-2026-005 — Server-authoritative ETA and readiness prediction

**Problem**  
Do not present a fabricated client formula as an ETA. Food ETA must incorporate preparation + dispatch/supply + courier travel + route/traffic uncertainty.

**Required**
- Remove client-side static distance formula from Food discovery.
- Expose server ETA range for merchant cards, merchant detail, checkout quote, and live order tracking.
- ETA components should support merchant prep time, busy-mode modifier, courier supply/matching estimate, pickup travel, delivery route/traffic, batching impact, and confidence/fallback.
- Refresh ETA after merchant acceptance, courier assignment, ready state, pickup, route deviation, and material delays.
- Track predicted-vs-actual metrics for continuous calibration.

**Acceptance criteria**
- Every displayed ETA is sourced from a server contract or explicitly labeled unavailable.
- No customer-facing fabricated local fallback such as `8 + distance * 4`.

### FOOD-2026-006 — Wire contactless delivery end-to-end

**Required**
- Add customer checkout control for contactless delivery and structured delivery instructions.
- Persist through create-order, merchant/courier order detail, tracking, and POD.
- Courier UI must surface contactless instruction before delivery.
- POD policy must support contactless proof without forcing unsafe face-to-face handoff.

### FOOD-2026-007 — Canonical Food state machine + cross-app contract tests

**Required**
- Publish one canonical state-transition contract used by customer, merchant, courier and backend.
- Define actor/action permissions and terminal-state invariants.
- Ensure merchant `mark ready`, automatic prep-time dispatch, courier matching, pickup and delivery cannot race into invalid states.
- Realtime events must be versioned/orderable and recoverable through REST snapshot after missed socket events.
- Out-of-order/duplicate events must not regress state.

**Mandatory automated scenarios**
1. Happy path payment → merchant accept → prepare → courier assign → secure pickup → delivery → settlement.
2. Customer double-tap/retry create.
3. Payment timeout/failure and later callback.
4. Merchant reject.
5. Merchant 3-minute timeout/auto-cancel.
6. Item/variant becomes unavailable before order confirmation.
7. Merchant edits/substitutes item with customer approval.
8. Scheduled order activation.
9. No courier available / delayed dispatch.
10. Courier reject/reassignment.
11. Courier cancels at pickup with evidence.
12. Merchant early-ready and late-ready paths.
13. Invalid/replayed handoff token.
14. Contactless delivery.
15. Partial refund/edit.
16. Batch-two-food-orders path.
17. Socket offline → reconnect → REST reconciliation.
18. Duplicate/out-of-order notification and webhook events.

### FOOD-2026-008 — Customer location/privacy permission hardening

**Required**
- Audit customer app need for background location and boot-time location tracking.
- Food browsing/checkout should follow least-privilege location access; request precise/background access only when a concrete user-visible feature requires it.
- Do not start persistent tracking merely because the app rebooted unless explicitly justified and policy-compliant.
- Provide graceful manual/saved-address flow when location permission is denied.
- Document retention, purpose, consent and telemetry boundaries.

### FOOD-2026-009 — Payment/refund/reconciliation invariants

**Required**
- Define ledger invariants for pending payment, authorized/paid, merchant reject/timeout, customer cancel, courier failure, edit/partial refund, tip and settlement.
- Webhooks and refund commands must be idempotent.
- Ensure order state cannot say completed while money state is unreconciled without a visible exception queue.
- Add reconciliation job/dashboard for order total ↔ payment ↔ promo subsidy ↔ merchant payable ↔ courier earning ↔ platform fee ↔ refund.
- Every manual financial correction requires actor/reason/audit event.

---

## P1 — Core Marketplace Parity

### FOOD-2026-010 — Customer Pickup / self-pickup mode
- Support Delivery vs Pickup at discovery, merchant detail and checkout.
- Pickup has no courier dispatch/delivery fee.
- Customer receives readiness notification and verifies pickup via one-time PIN/QR.
- Define pickup expiry/no-show policy.

### FOOD-2026-011 — Merchant Busy mode distinct from Paused
- Keep store open while extending prep/ETA under load.
- Propagate new prep expectation to matching and customer ETA.
- Keep existing Pause/Resume for temporarily stopping new orders.
- Allow timed busy mode and operational telemetry.

### FOOD-2026-012 — Quantity-aware inventory and scheduled availability
- Extend boolean availability with optional stock/sales limits.
- One-time and recurring reset windows.
- Scheduled item availability by day/time.
- Atomic reservation/decrement on accepted order; deterministic release on cancellation where applicable.
- Prevent oversell under concurrency.

### FOOD-2026-013 — Out-of-stock substitution/customer approval flow
- Merchant proposes remove/replace/quantity changes.
- Customer receives itemized delta and new total.
- Customer approve/reject/timeout policy.
- Recalculate promo/tax/payment/refund delta atomically.
- Notify courier if package/order detail materially changes.

### FOOD-2026-014 — Food discovery/ranking 2026
- Cuisine/category chips and browse rails.
- Sort/filter by ETA, delivery fee, rating, promo, price/minimum order, open-now, halal, Pickup.
- Reorder / recent / favorites / popular-near-you rails.
- Search ranking should combine relevance, availability, ETA and distance rather than client-only filtering.
- Add pagination/cursor and empty/degraded states.
- Separate organic ranking from sponsored placement with clear labeling if ads are introduced.

### FOOD-2026-015 — Operating hours maturity
- Regular hours.
- Special/holiday closures.
- Temporary closure.
- Last-order cutoff.
- Scheduled-order availability based on future hours and future item stock.

### FOOD-2026-016 — Food-specific checkout options
- Cutlery/utensils toggle.
- Structured delivery instruction templates + free text.
- Gift/receiver flow should not leak customer identity unnecessarily.
- Clearly display merchant notes vs courier delivery notes as separate concepts.

### FOOD-2026-017 — Courier food waiting/merchant issue flow
- `arrived_at_merchant`, `order_not_ready`, waiting timer, merchant-ready signal.
- Reasoned issue flows: store closed, item issue, excessive wait, wrong order, damaged packaging, cannot verify handoff.
- Waiting time becomes operational telemetry and can feed compensation/routing policy.
- Food pickup checklist should explicitly cover order identity, sealed packaging and handoff verification.

### FOOD-2026-018 — Merchant kitchen cockpit / SLA UX
- New, scheduled/upcoming, preparing, ready/driver-arriving, completed lanes.
- Countdown/urgency based on promised ready time and courier ETA.
- One-tap accept/reject with clear consequences.
- Busy/Pause status highly visible.
- Ready action must be consistent with automatic dispatch/prep logic.
- Printer failure/retry should not block order state.

### FOOD-2026-019 — Ratings/reviews parity and trust surfaces
- Customer-visible merchant rating count and review details.
- Merchant reply/moderation reporting path.
- Separate food/item/resto quality from courier delivery rating where useful.
- Fraud/spam controls and auditability.

---

## P2 — Competitive Differentiators / Scale Features

### FOOD-2026-020 — Group orders and optional split payment
- Shareable group cart, participant deadline, spending cap, creator controls, conflict-safe item updates.

### FOOD-2026-021 — Membership/free-delivery program
- Subscription/benefit entitlement service; transparent fee eligibility and subsidy accounting.

### FOOD-2026-022 — Personalized ranking/recommendation
- Privacy-aware signals, explainable fallback, cold-start strategy and experiment framework.

### FOOD-2026-023 — Sponsored merchant/menu placements
- Explicit ad labeling, auction/budget/campaign controls, attribution, fraud controls, organic ranking isolation.

### FOOD-2026-024 — Multi-store / Mix & Match exploration
- Treat as a separate orchestration project; do not overload single-merchant cart invariants prematurely.

### FOOD-2026-025 — POS/KDS integration
- Order injection, acknowledgement, menu/catalog sync, stock sync, reconciliation and connector health dashboard.

### FOOD-2026-026 — Adaptive UI/accessibility modernization
- Validate phone/tablet/foldable layouts for target API 36 behavior.
- Screen-reader labels, dynamic text scaling, touch target sizing, contrast, reduced-motion handling.
- Update stale Android libraries after compatibility/regression tests.

---

## UI/UX Design Principles for Food

1. **Trust beats decoration.** Address pin, total price, ETA and order state must never be guessed or contradictory.
2. **One source of truth.** Server is authoritative for price, availability, ETA and order state; apps render/reconcile that truth.
3. **Progressive disclosure.** Customer should understand restaurant → item customization → cart → destination → quote/payment → tracking without operational jargon.
4. **Actionable errors.** “Item unavailable” should offer substitute/remove/requote, not generic failure.
5. **Role-specific urgency.** Customer sees confidence and next step; merchant sees preparation/SLA; courier sees pickup readiness/navigation/handoff verification.
6. **Realtime is an optimization, not the database.** Any app can recover from missed events by fetching the latest authoritative snapshot.

---

## Observability / Launch Dashboard

Instrument at minimum:
- Food quote success/failure/latency and quote-to-order conversion.
- Duplicate create attempts prevented by idempotency.
- Merchant acceptance/rejection/timeout rate and response time.
- Prep-time prediction vs actual ready time.
- Courier match time, reassign rate, merchant wait time.
- ETA predicted vs actual by stage and area.
- Handoff verification failure/replay/override rate.
- Customer/merchant/courier cancellation reason distribution.
- Payment success, refund latency and reconciliation discrepancies.
- Realtime disconnect/recovery and notification delivery rate.
- Crash-free sessions, ANR, cold/warm startup and API p95/p99.

## Definition of Done

A task is not complete merely because UI exists. It is complete only when:
- API/domain contract and state invariants are documented.
- Server-side validation exists.
- Customer/merchant/courier surfaces are wired where applicable.
- Retry/idempotency/offline behavior is defined.
- Audit/telemetry exists for operationally material actions.
- Unit/integration/contract tests exist.
- Required end-to-end scenario is automated or has an explicit staging validation script.
- No client-only fabricated price, ETA or order-state logic remains in production paths.
