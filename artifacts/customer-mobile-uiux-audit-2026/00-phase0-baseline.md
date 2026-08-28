# Phase 0 — Evidence Baseline & Source-of-Truth Reconciliation

**App:** `android-app-customer` (Kotlin + Jetpack Compose)
**Branch / Commit:** `staging` @ `89037cc`
**Audit date:** 2026-08-28
**compileSdk / targetSdk:** 36 (Android 15)
**APK version:** from `versionName`/`versionCode` gradle properties (not pinned in source)
**Total Kotlin files scanned (excl. build/):** 166
**Screen composables (`*Screen.kt`):** 36

> Rule reminder: this is the **read-only audit phase**. No UI implementation is performed here. Findings feed Phase 7 remediation tickets for later approval.

---

## 0.1 Evidence Capture Template (per run)

| Run | Commit | API | Device / window | Font scale | Locale | Theme | Network |
|-----|--------|-----|----------------|-----------|--------|-------|---------|
| baseline-static | `89037cc` | 36 | n/a (static) | n/a | id | n/a | n/a |

Device/emulator states (light, dark, compact 320–360dp, common 393–412dp, large/foldable, font 1.0x/2.0x, gesture nav) are pending **Phase 5** — require emulator + screenshots.

---

## 0.2 Source-of-Truth Reconciliation

### 0.2.1 Palette conflict — `docs/TEMBUS_MOBILE_DESIGN_GUIDELINES_2026.md` is STALE

The guidelines doc still documents the **old brand palette** and contradicts the approved 2026 palette (`Color.kt`) and ADR 2026-08-21-C:

| Token | Guidelines doc (WRONG) | Approved `Color.kt` (source of truth) |
|-------|------------------------|----------------------------------------|
| Primary | `#0D5C2F` | `#003A20` (`Primary`) |
| Secondary / progress | `#138C3B` | `PrimaryBase #005C32` |
| Accent CTA | `#FF7A00` | `#F97316` (`Accent`) |
| Card radius | 20dp | 8dp component rule (current) |

The doc also permits negative letter-spacing ("0.sp") — fine, but it lists `Radius 20dp` while the active design-system rule is 8dp. **Action:** reconcile the doc to the approved palette before it misleads future UI work (P2 doc-hygiene, but blocks correctness of any guideline-driven build).

### 0.2.2 `colors.xml` still defines old palette

`app/src/main/res/values/colors.xml` defines `<color name="primary">#0D5C2F</color>`, `<color name="accent">#FF7A00</color>` (and `_dark`/`_light` variants). These are legacy XML resources. No Compose screen should reference them post-migration; they are dead-but-confusing source-of-truth noise. Confirmed no `*Screen.kt` uses `@color/primary`/`@color/accent` (grep negative) — but they remain a trap for new code.

---

## 0.3 Screen & Route Inventory

### 0.3.1 `sealed class Screen` routes (36 registered)

Source: `ui/navigation/Screen.kt`

**Top-level / shell**
- `onboarding`, `auth_graph`, `dashboard`, `booking` (+open/promo query), `history`, `business`, `profile`, `notifications`

**Details (deep-linkable, order-scoped)**
- `tracking/{orderId}`, `detail/{orderId}`, `payment/{orderId}`, `chat/{orderId}?name=`, `call/{orderId}?name&state&callId`

**Tambal Ban & Towing**
- `nearby-couriers/{serviceSubType}/{lat}/{lng}`, `tambal-ban-home`, `tambal-ban-search/{lat}/{lng}?serviceSubType=`, `courier-detail/{courierId}?...`, `service-tracking/{orderId}/{serviceSubType}`, `service-report/{orderId}/{serviceSubType}`, `service-category`, `sub-type-selector/{category}`, `service-booking/{serviceSubType}?courierId&courierPrice&...`

**Food**
- `food-home`, `food-merchant/{merchantId}`, `food-cart`, `food-checkout`, `food-favorites`

**Account / misc**
- `language`, `referral`, `loyalty`

### 0.3.2 Unregistered / nested composables (not in `Screen.kt`)

Dialogs & sheets that are NOT routes (correctly delegated):
`MerchantRatingDialog`, `CourierRatingDialog`, `TipDialog`, `WithdrawDialog`, `DisputeDialog`, `ServiceGridMenu`, `CourierPriceCard`, `LocalDeviceSecurityUi`, `SemanticsHelpers`.

No dead/unreachable route detected in `Screen.kt` — all 36 are referenced from `RootNavGraph.kt`. ✅

### 0.3.3 File count vs task estimate

Task file estimated "34 `*Screen.kt` + 30 route objects". Actual: **36 `*Screen.kt`** files and **36 `Screen` route objects**. Inventory supersedes the estimate.

---

## 0.4 Direct Color Usage Classification

Method: regex `Color\s*\(\s*0x[0-9A-Fa-f]{6,8}\s*\)` across 166 Kotlin files (excl. build). Raw `#RRGGBB` string literals: only **3** (all legitimate: `#00AED6`/`#008EB0` = tambal-ban brand teal in `TambalBanHomeScreen`/`CourierPriceCard` partner exception; `#F97316` in `Color.kt` definition). So the legacy `#hex` problem from the task's preliminary verdict has been **resolved by tokenization** — the surviving risk is `Color(0x..)` int literals bypassing named tokens.

**Totals (320 `Color(0x..)` occurrences, 30 files):**

| Class | Count | Meaning |
|-------|-------|---------|
| `token_ok` | 60 | Already a `Color.kt` named token (shadowed by literal form but correct value) |
| `OLD_BRAND` | 5 | `#0D5C2F` / `#FF7A00` — OLD palette, must migrate |
| `TAILWIND_GRAY` | 121 | Hardcoded neutral grays (e.g. `0xFF111827`, `0xFF667085`, `0xFFE5E7EB`) — **token-violation**, should use `OnSurface`/`Outline`/etc. |
| `partner_or_exc` | 61 | Partner brand / map / status semantic that may be legitimate exceptions (teal, semantic success/warning/error, gold tier) |
| `unclassified` | 73 | Varied; needs per-occurrence review (many are soft tints / near-token greys) |

### 0.4.1 OLD_BRAND occurrences (P0 palette violation)

| File:line | Usage |
|-----------|-------|
| `ui/navigation/RootNavGraph.kt:685` | `tint = Color(0xFFFF7A00)` promo badge icon |
| `ui/navigation/RootNavGraph.kt:686` | `else -> Color(0xFF0D5C2F)` non-promo badge icon |
| `ui/navigation/RootNavGraph.kt:711` | `Text(..., color = Color(0xFF0D5C2F), ...)` "Buka" label |
| `ui/screens/tracking/TrackingScreen.kt:561` | `.background(Color(0xFFFF7A00))` status dot |
| `ui/components/maps/MapPrimitives.kt:70` | `BitmapDescriptor(color = Color(0xFF0D5C2F))` default marker |

Fix target: `Accent` (`#F97316`) for the orange dot/badge; `Primary` (`#003A20`) for green icon/label; `CourierMapBase`/map token for marker default.

### 0.4.2 Highest-density files (color-int)

| File | Color-int | Breakdown |
|------|-----------|-----------|
| `theme/Color.kt` | 54 | definitions (expected) |
| `screens/chat/ChatScreen.kt` | 49 | 33 tailwind-gray + 8 unclassified + 4 partner + 4 token — **primary remediation target** |
| `screens/tracking/TrackingScreen.kt` | 31 | 9 tailwind + 13 unclassified + 8 partner + 1 OLD_BRAND |
| `screens/auth/CompleteProfileScreen.kt` | 20 | 12 tailwind + 8 unclassified |
| `screens/call/InAppCallScreen.kt` | 20 | 8 tailwind + 7 unclassified + 5 partner |
| `security/LocalDeviceSecurityUi.kt` | 18 | 8 tailwind + 5 unclassified + 5 partner |

Full per-file breakdown + distinct-RGB map saved to `evidence/color_int_classified.json`.

---

## 0.5 Accessibility — `contentDescription = null` inventory

**37 files, 112 occurrences.** Task preliminary verdict estimated 114 across the tree; current count 112 (close; mostly resolved or shifted). Not all are violations — decorative icons (e.g. spacer-like graphics) are legitimately `null`. Each must be verified in **Phase 4** with TalkBack. Files with the most:

- `screens/chat/ChatScreen.kt`, `screens/tracking/TrackingScreen.kt`, `screens/auth/CompleteProfileScreen.kt`, `screens/call/InAppCallScreen.kt`, `screens/food/*`, `screens/profile/*`, `components/*`.

Actionable icon `null`s (e.g. buttons, toggle icons) are the P1 a11y findings to extract in Phase 4.

---

## 0.6 Phase 0 Verdict

- Palette tokenization of `#hex` literals is **largely done** (raw hex ≈ 0); the live risk is `Color(0x..)` int literals that bypass `Color.kt` tokens — **121 Tailwind-gray + 73 unclassified + 5 OLD_BRAND**.
- **OLD_BRAND survives in 3 files** (RootNavGraph, TrackingScreen, MapPrimitives) + `colors.xml` + the stale guidelines doc — a clear P0 palette finding once device-verified.
- Route graph is **complete and consistent** (36/36 reachable, no dead routes).
- `contentDescription=null` concentrated in chat/tracking/auth/call — Phase 4 work.

**Phase 0 deliverables produced:**
- `00-phase0-baseline.md` (this file)
- `evidence/color_int_classified.json` (machine-readable scan)
- `04-palette-token-audit.md` (color-focused deep dive)

Next: Phase 1 (navigation map) can be derived from `Screen.kt` + `RootNavGraph.kt` statically; Phases 2–6 require emulator traversal + screenshots (deferred to a run with device availability).
