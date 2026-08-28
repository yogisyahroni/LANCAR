# Customer Mobile UI/UX & Flow Audit 2026

**Status:** Active — Phase 0 (baseline/palette) + Phase 1 (navigation) executed statically; Phases 2–6 pending emulator/device traversal. Deliverables in `artifacts/customer-mobile-uiux-audit-2026/`. 
**Created:** 2026-08-27  
**Platform:** `android-app-customer` (Kotlin + Jetpack Compose)  
**Scope rule:** Audit first. Do not mix findings with implementation until the audit report and remediation priorities are approved.

## Objective

Determine, with reproducible evidence, whether the TEMBUS customer Android app:

1. meets current 2026 expectations for customer-facing on-demand delivery, food delivery, roadside service, payment, and live tracking apps;
2. provides a clear, efficient, recoverable end-to-end customer journey;
3. conforms to the approved TEMBUS light/dark color system from `ChatGPT Image 21 Agu 2026, 23.32.43.png`;
4. meets Android quality, Material 3, and WCAG 2.2 AA accessibility expectations; and
5. remains usable on compact phones, common phones, large phones, tablets/foldables, large text, dark mode, poor network, denied permissions, and process recreation.

## Preliminary Verdict — Before Device Audit

**Current status: partially compliant; not yet acceptable as fully compliant.**

What already aligns:

- Canonical theme tokens exist for Primary Green `#003A20`, Accent Orange `#F97316`, light/dark neutrals, and semantic status colors.
- `TEMBUSCustomerTheme` supports system light/dark mode and disables dynamic color by default, so the TEMBUS identity is not replaced by wallpaper colors.
- Shared component defaults exist for buttons, cards, fields, chips, navigation, status, and a `48.dp` minimum target convention.
- The app has explicit routes for onboarding/auth, package booking, food, tambal ban/towing, payment, tracking, history, notifications, chat/call, profile, loyalty, and referral.

Why it cannot be marked fully compliant yet:

- Static baseline still finds about **389 direct color usages across 37 non-theme Kotlin files**. Some may be legitimate map/media/brand exceptions, but each must be classified; several visible components still use the old palette such as `#0D5C2F`, `#FF7A00`, white-only surfaces, and unrelated status colors.
- There are about **114 `contentDescription = null` occurrences**. Decorative icons are allowed, but actionable icons need an accessible name and must be verified individually.
- Static scan sees many visual elements below `48.dp`. Many are likely icons or indicators rather than touch targets, so this is a device/semantics inspection item—not an automatic failure.
- Light/dark screenshot regression, text overflow, map/action-panel overlap, and system-bar inset checks remain pending in the existing standardization task.
- `docs/TEMBUS_MOBILE_DESIGN_GUIDELINES_2026.md` still contains an older palette (`#0D5C2F`, `#FF7A00`) and larger radii, conflicting with the approved palette and current 8dp component rule.
- Full customer funnel quality cannot be proven by compile success. It needs real-device/emulator traversal, failure-state testing, and a benchmark against current comparable apps.

## Authoritative Standards

- TEMBUS source of truth:
  - Primary Green `#003A20`; Accent Orange `#F97316`.
  - 70% neutral/background, 20% primary green, 10% accent orange as a visual composition target—not a pixel-perfect quota.
  - Centralized light/dark tokens; no unexplained one-off UI colors.
  - Semantic aliases for success, warning, error, info, pending, active, completed, cancelled, and disabled.
- Android official quality guidance:
  - Core app quality and consistent Android interaction patterns.
  - Adaptive app quality across window sizes, orientations, multi-window, and foldables.
  - Edge-to-edge layouts, safe system insets, deep links, localization, and state continuity.
  - Predictive back behavior without placing conflicting gestures inside system gesture regions.
- Material 3:
  - Clear hierarchy, consistent components/tokens, state-layer feedback, predictable navigation, and adaptive navigation patterns.
- WCAG 2.2 AA target:
  - Text contrast at least `4.5:1` for normal text and `3:1` for large text.
  - Non-text/component contrast at least `3:1` where required.
  - Accessible names, roles, values, logical traversal, error identification, non-color status cues, and minimum target sizing/spacing.
  - TEMBUS mobile product target remains `48dp` for important interactive controls even though WCAG 2.2's web minimum can be smaller with spacing exceptions.

## Comparable-App Benchmark Set

Use current production versions available during the audit, record app version/date/device, and inspect only publicly observable behavior:

- Gojek — super-app home, GoSend/GoFood discovery, address selection, checkout, tracking, support.
- Grab — transport/delivery/food information hierarchy, saved places, price/ETA comparison, matching, live tracking.
- Lalamove — package delivery form, vehicle choice, multi-stop concepts, price transparency, order status.
- Maxim — service discovery, booking density, price/ETA presentation, order lifecycle.
- ShopeeFood or equivalent current Indonesian food flow — merchant discovery, cart, promo, checkout, order status.

Do not copy visual styling. Benchmark task completion, clarity, error recovery, trust signals, and interaction cost.

## Audit Score Model

Score every criterion as:

- `2 — Pass`: implemented, visible, and verified on device.
- `1 — Partial`: exists but is inconsistent, unclear, or missing an important state.
- `0 — Fail`: missing, blocked, misleading, inaccessible, or contradictory.
- `N/A`: genuinely outside product scope, with written rationale.

Calculate scores per domain and overall. A compile/build result is evidence of implementation health, not a UX pass.

Release interpretation:

- `90–100%`: ready, only minor polish.
- `80–89%`: conditionally ready; P0/P1 findings must be zero.
- `70–79%`: remediation required before public scale-up.
- `<70%`: major redesign/flow repair required.

Any P0 automatically blocks “standard-compliant” status regardless of score.

## Phase 0 — Evidence Baseline & Source-of-Truth Reconciliation

- [ ] Capture branch, commit SHA, APK version, Android API level, device/window size, font scale, locale, theme, and network condition for every test run.
- [ ] Reconcile `docs/TEMBUS_MOBILE_DESIGN_GUIDELINES_2026.md` with the approved TEMBUS palette and ADR 2026-08-21-C.
- [ ] Create an inventory of all 34 customer `*Screen.kt` files, 30 route objects, 26 registered Compose destinations, dialogs, sheets, banners, and permission prompts.
- [ ] Confirm every route object is either registered, intentionally delegated to a nested graph, or documented as dead/unreachable.
- [ ] Classify all direct color usages as `token violation`, `semantic exception`, `map/media exception`, `partner brand`, or `test/debug only`.
- [ ] Produce a single baseline report instead of relying on completed checkboxes from the older migration task.

## Phase 1 — Information Architecture & Navigation Audit

- [ ] Draw the actual navigation map from launch to onboarding/auth and all logged-in destinations.
- [ ] Verify primary destinations are obvious and stable: Home, Orders/History, active Tracking, Notifications, and Profile.
- [ ] Check that food, package, tambal ban, and towing use service-specific vocabulary while preserving a consistent global shell.
- [ ] Verify back/up behavior, predictive back preview, back-stack cleanup after login/order creation/payment, and state restoration after process death.
- [ ] Verify notification and deep-link entry routes open the exact relevant order/chat/tracking/booking content and fail safely for expired/unauthorized IDs.
- [ ] Identify unreachable screens, circular flows, duplicate routes, unexpected dashboard resets, and dead ends.
- [ ] Compare TEMBUS navigation depth and discoverability with the benchmark apps; record taps and decision points for equivalent jobs.

## Phase 2 — End-to-End Customer Flow Audit

Audit happy path, empty, loading, API error, offline, timeout, retry, permission denied, app interruption, and resume behavior for each flow.

### A. First Run, Authentication, and Account Recovery

- [ ] Splash/onboarding communicates value quickly and can be completed or skipped without confusion.
- [ ] Login, Google login, phone capture, OTP, complete profile, session expiry, and retry errors use clear Indonesian copy.
- [ ] OTP flow supports autofill/paste, countdown, resend rules, wrong/expired code, rate limit, and accessible authentication.
- [ ] Back navigation never loses completed data without warning.

### B. Home and Service Discovery

- [ ] User understands available services in two seconds and can distinguish package, food, tambal ban, and towing.
- [ ] Active order takes priority over promotions and secondary content.
- [ ] Notification badge, location context, recent/saved actions, and shortcuts have clear states.
- [ ] Loading/error/offline states do not show fake/default business data.

### C. Package Delivery Booking

- [ ] Pickup/dropoff input, map pin adjustment, current location, address detail, sender/receiver contact, and service-area validation are clear.
- [ ] Package detail, photo, category/size/weight, notes, vehicle/service choice, price, ETA, promo, insurance, and payment use progressive disclosure.
- [ ] Review screen makes pickup, dropoff, recipient, service, price breakdown, route, ETA, and payment method easy to verify before commitment.
- [ ] Validation is local to the failed field and preserves previously entered data.

### D. Food Ordering

- [ ] Location permission denial never silently falls back to a misleading city/location.
- [ ] Merchant search/discovery, availability, distance/ETA, favorites, menu options, stock, cart, notes, fees, promo, checkout, and reorder are understandable.
- [ ] Cart changes, unavailable items, minimum order, merchant closure, price changes, and duplicate submission have recoverable flows.

### E. Tambal Ban and Towing

- [ ] Category/subtype selection uses service vocabulary, not package-delivery vocabulary.
- [ ] Location, vehicle detail, issue description, technician/armada choice, price components, ETA, proof, and safety information are transparent.
- [ ] Matching/search timeout, courier unavailable, cancellation, active service tracking, completion report, and rating are recoverable.
- [ ] Towing and tambal ban are visually related to TEMBUS but distinct enough to prevent service-selection mistakes.

### F. Payment and Confirmation

- [ ] Total, fee breakdown, discounts, wallet balance, payment method, expiry, retry, pending, failed, paid, and duplicate-tap states are unambiguous.
- [ ] Orange is used for focused/high-energy action, not as an alternative status/error system.
- [ ] Payment completion routes to the correct next state without double-order risk.

### G. Matching, Live Tracking, Communication, and Safety

- [ ] Searching, courier found, pickup approach, arrived, in service/delivery, destination arrival, completion, and cancellation have distinct copy and visual states.
- [ ] Map, route, ETA, action panel, courier identity, vehicle, chat, call, support, and SOS remain readable without overlap.
- [ ] Stale/offline tracking is visibly labeled with last-updated time.
- [ ] Chat/call controls remain reachable but do not obscure critical tracking or system gestures.

### H. Post-Order, History, Dispute, and Retention

- [ ] Completion proof, invoice, tip, rating, review, report issue/dispute, reorder, and support are discoverable.
- [ ] History filtering and detail status are consistent across package, food, tambal ban, and towing.
- [ ] Loyalty, referral, address book, language, profile, withdrawal/wallet, privacy, notifications, and logout have consistent hierarchy and safe confirmations.

## Phase 3 — Visual Hierarchy & TEMBUS Palette Compliance

- [ ] Measure every key screen against the 70/20/10 composition intent using screenshots and visual inspection; do not enforce a brittle pixel-count quota.
- [ ] Verify Primary Green `#003A20` is the dominant brand/action color and Accent Orange `#F97316` is used sparingly for high-energy emphasis.
- [ ] Verify primary, secondary, tertiary, destructive, disabled, selected, pressed, focused, loading, and unavailable states are not communicated by color alone.
- [ ] Verify light and dark mode tokens for background, surface, elevated surface, border, text, semantic state, and system bars.
- [ ] Flag old palette values (`#0D5C2F`, `#138C3B`, `#FF7A00`) and unrelated greens/oranges unless an exception is documented.
- [ ] Verify typography hierarchy, spacing rhythm, card/input/button radius, elevation, icon style, image treatment, and motion are consistent across service verticals.
- [ ] Confirm no emoji is used as a functional UI icon.
- [ ] Verify all graphs, maps, photos, partner marks, and food imagery remain distinguishable without corrupting the brand palette rule.

## Phase 4 — Accessibility Audit (WCAG 2.2 AA + Android)

- [ ] Compute text contrast for every token pair and any surviving direct color pair in light/dark modes.
- [ ] Verify non-text contrast for controls, focus/selection indicators, map overlays, status chips, borders, and icons.
- [ ] Inspect all `contentDescription = null` occurrences; keep only genuinely decorative icons null.
- [ ] Verify accessible name, role, state, value, heading, live-region behavior, traversal order, and merged semantics with TalkBack.
- [ ] Verify all important touch targets are at least 48dp and smaller visual icons have an adequate clickable container/spacing.
- [ ] Test Switch Access/keyboard traversal where applicable; focus must not be hidden behind sheets, keyboard, or system bars.
- [ ] Test font scales 1.0x, 1.3x, 1.5x, and 2.0x; no clipped price, address, CTA, chip, timeline, dialog, or bottom sheet.
- [ ] Test Indonesian and English strings, long names/addresses, large currency values, and RTL layout resilience.
- [ ] Verify motion can tolerate animator scale changes/reduced motion and no essential information depends only on animation.

## Phase 5 — Adaptive, System UI, and Resilience QA

- [ ] Test compact phone, common phone, large phone, tablet/foldable or resizable emulator, portrait, landscape, and split-screen.
- [ ] Verify edge-to-edge content, status/navigation bar contrast, cutout handling, IME inset, bottom navigation, sheets, maps, and gesture navigation.
- [ ] Verify no action is placed inside predictive-back/system gesture conflict zones.
- [ ] Test process death and recreation on every multi-step form and active-order surface.
- [ ] Test notification/call interruption, lock/unlock, app switcher, GPS disabled, permission revoked, battery saver, slow network, offline, and backend timeout.
- [ ] Verify loading skeletons approximate final layout and prevent major layout shift.

## Phase 6 — Benchmark Study

For each comparable app, record version/date/device and measure the same jobs:

- [ ] Time/taps from home to a reviewed package-delivery order.
- [ ] Time/taps from home to a reviewed food checkout.
- [ ] Location correction and saved/recent address reuse.
- [ ] Service/vehicle comparison, fee/ETA clarity, and trust signals.
- [ ] Matching feedback, tracking status clarity, chat/call/support discoverability.
- [ ] Failure recovery for no courier, unavailable merchant/item, weak network, and payment pending/failure.
- [ ] Post-order proof, invoice, rating, dispute, and reorder.
- [ ] Identify patterns TEMBUS should adopt, patterns to avoid, and intentional differentiators.

## Phase 7 — Findings, Prioritization, and Remediation Backlog

- [ ] Produce a scorecard for UI consistency, flow usability, palette, accessibility, adaptive quality, resilience, trust/safety, and benchmark parity.
- [ ] Every finding must include screen/route, reproduction steps, actual behavior, expected behavior, evidence, affected users, severity, and recommended fix.
- [ ] Severity rules:
  - `P0`: blocks critical flow, causes wrong/duplicate order/payment, hides essential state, traps navigation, or creates serious accessibility/safety failure.
  - `P1`: major friction, misleading pricing/ETA/status, unrecoverable form loss, inconsistent dark mode, or inaccessible important control.
  - `P2`: consistency, hierarchy, discoverability, copy, or efficiency issue with a workaround.
  - `P3`: polish or delight improvement with no material task impact.
- [ ] Convert approved findings into implementation tickets grouped by reusable component/token/flow slice, not one ticket per screenshot.
- [ ] Keep UI-only changes separate from backend contract changes unless the audit proves the contract itself prevents correct UX.

## Required Evidence Matrix

Capture at least these states in both light and dark mode:

| Flow | Required states |
| --- | --- |
| Launch/auth | first run, returning user, OTP error/expired, session expired |
| Home | normal, active order, loading, empty, API error, offline |
| Package | pickup/dropoff, package detail, service choice, review, validation error |
| Food | home, merchant, item options, cart, checkout, unavailable/error |
| Tambal ban | discovery, search, technician detail, booking, tracking, report |
| Towing | subtype, vehicle/location, armada/detail, booking, tracking, proof |
| Payment | method choice, pending, paid, failed, expired, retry |
| Tracking | searching, assigned, arriving, active, stale/offline, completed/cancelled |
| Support | notifications, chat, call, dispute, SOS/support entry |
| Account | history/detail, profile, address, language, loyalty/referral, logout |

Test each critical flow at minimum on:

- compact phone around 320–360dp width;
- common phone around 393–412dp width;
- large phone or foldable cover/open state;
- tablet/resizable window;
- font scale 1.0x and 2.0x;
- gesture and 3-button navigation where available.

## Deliverables

- [ ] `artifacts/customer-mobile-uiux-audit-2026/01-scorecard.md`
- [ ] `artifacts/customer-mobile-uiux-audit-2026/02-navigation-flow-map.md`
- [ ] `artifacts/customer-mobile-uiux-audit-2026/03-screen-state-inventory.md`
- [ ] `artifacts/customer-mobile-uiux-audit-2026/04-palette-token-audit.md`
- [ ] `artifacts/customer-mobile-uiux-audit-2026/05-accessibility-audit.md`
- [ ] `artifacts/customer-mobile-uiux-audit-2026/06-benchmark-comparison.md`
- [ ] `artifacts/customer-mobile-uiux-audit-2026/07-findings-register.md`
- [ ] `artifacts/customer-mobile-uiux-audit-2026/08-remediation-roadmap.md`
- [ ] Timestamped screenshots/video and test metadata under `artifacts/customer-mobile-uiux-audit-2026/evidence/`.

## Acceptance Criteria

- [ ] All customer routes and key state variants are inventoried and tested, with no unexplained coverage gap.
- [ ] Final report states `Pass`, `Partial`, `Fail`, or `N/A` per criterion and calculates per-domain scores.
- [ ] Palette verdict distinguishes foundation-token compliance from actual per-screen compliance.
- [ ] Every direct color exception is classified; no visible old-brand color remains unexplained.
- [ ] All P0/P1 findings have reproducible evidence and an owner-ready remediation ticket.
- [ ] Benchmark conclusions include current app version/date and distinguish convention from TEMBUS product differentiation.
- [ ] Accessibility report includes contrast calculations plus TalkBack/manual target-size/text-scale evidence.
- [ ] Light/dark, compact/common/large/adaptive, edge-to-edge, predictive back, and failure-state evidence is attached.
- [ ] Final go/no-go statement answers explicitly whether the customer app meets 2026 comparable-app, TEMBUS palette, and accessibility standards.

## Verification Commands After Any Approved Remediation

Run from repository root after implementation tasks, not during the read-only audit phase:

```powershell
.\android-app-customer\gradlew.bat -p android-app-customer testDebugUnitTest
.\android-app-customer\gradlew.bat -p android-app-customer connectedDebugAndroidTest
.\android-app-customer\gradlew.bat -p android-app-customer assembleDebug
make test
make lint
graphify update .
```

If `graphify` is unavailable, record the tool blocker explicitly and do not claim the graph is current.

## Official Reference Links

- Android: https://developer.android.com/quality/user-experience
- Android core app quality: https://developer.android.com/docs/quality-guidelines/core-app-quality
- Android adaptive app quality: https://developer.android.com/develop/adaptive-apps/quality-guidelines/adaptive-app-quality
- Android adaptive layouts: https://developer.android.com/design/ui/mobile/guides/layout-and-content/adapt-layout
- Android predictive back: https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- WCAG contrast: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum
- WCAG target size: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

