# 🚀 TEMBUS ROADMAP TO 2026 STANDARD
## Gabungan Industry Analysis + Rekomendasi Actionable + Detailed Tasks + God-File Refactor + Build Optimization

**Repo:** https://github.com/yogisyahroni/LANCAR (staging branch)  
**Baseline Assessment:** 2026-08-25 (AI Agent Kimi + Grok consolidation)  
**Current Overall Score:** **7.6/10** (Gojek 2018-level / Series B logistik)  
**Target Score:** **8.7–9.0/10** (Gojek/Grab 2024–2026 ready)  
**Timeline Realistic:** 6–9 bulan dengan eksekusi disiplin  

---

## 📊 BASELINE SCORECARD

| Aspek | Score | Kategori | Verdict |
|-------|-------|----------|---------|
| Engineering Architecture | 8.2/10 | 🟢 Above Average | Clean multi-service, tech debt ada |
| Code Quality | 7.5/10 | 🟢 Good | Consistent, tapi god files |
| Security | 8.5/10 | 🟢 Strong | S-SDLC Level 3, fraud prevention bagus |
| DevOps & CI/CD | 8.0/10 | 🟢 Mature | 8-phase pipeline |
| Observability | 7.0/10 | 🟡 Moderate | OTel + Jaeger, belum SLO |
| UI/UX Design System | 7.5/10 | 🟢 Good | Design tokens + glassmorphism |
| UI/UX Interaction | 6.5/10 | 🟡 Moderate | Framer Motion ada, polish kurang |
| Accessibility (a11y) | **5.5/10** | 🟠 Below Average | **Tidak WCAG 2.2 AA** |
| Mobile UX (Android) | 7.0/10 | 🟢 Good | Compose modern, Android 15 gap |
| Flow Completeness | 8.0/10 | 🟢 Good | 4 flows lengkap |
| Flow Reliability | 7.5/10 | 🟢 Good | Offline-first, race condition risk |

**Strengths utama:** Arsitektur multi-service, security-first, feature completeness Parcel + Food, modern stack (Go, Next.js, Compose, Tailwind v4).  
**Weaknesses kritis:** Accessibility, resilience patterns, observability SRE-level, god files, Android 15 compliance, UI polish, ukuran build.

---

## 🎯 VISI TARGET 2026

Platform logistik on-demand multi-service (Parcel, Food, Tambal Ban, Towing) yang:
- Memenuhi **WCAG 2.2 AA**
- Punya **resilience patterns** lengkap (circuit breaker, rate limit, bulkhead, retry)
- Observability **SRE-grade** (SLO, error budget, alerting)
- Android 15 compliant + modern mobile UX
- Codebase maintainable (tidak ada god file kritis)
- APK/AAB & web bundle ringan
- Siap scale tanpa rewrite besar

---

# BAGIAN 1 — GOD-FILE REFACTOR (File >500–5000+ baris)

### Status Saat Ini (hasil pengukuran repo)

| File | Lines | Priority | Target |
|------|-------|----------|--------|
| `backend/admin-service/src/controllers/courierAuth.controller.ts` | **5445** | 🔴 P0 | ≤ 300–400 |
| `backend/admin-service/src/controllers/customerOrder.controller.ts` | **5065** | 🔴 P0 | ≤ 300–400 |
| `admin-dashboard/src/pages/Finance.tsx` | **2622** | 🔴 P0 | ≤ 400 |
| `android-app/.../order/OrderDetailScreen.kt` | **2557** | 🔴 P0 | ≤ 400 |
| `backend/order-service/internal/service/order_service.go` | **2531** | 🔴 P0 | ≤ 400 |
| `android-app-customer/.../booking/BookingScreen.kt` | **2495** | 🔴 P0 | ≤ 400 |
| `admin-dashboard/src/pages/Settings.tsx` | **2129** | 🟠 P1 | ≤ 400 |
| `android-app/.../OnDemandMapScreens.kt` | **1614** | 🔴 P0 | ≤ 400 |
| `backend/order-service/internal/handler/order_handler.go` | **1541** | 🔴 P0 | ≤ 350 |
| `frontend/src/app/(portal)/orders/[id]/page.tsx` | **1530** | 🟠 P1 | ≤ 400 |
| `frontend/src/components/orders/OnDemandOrderForm.tsx` | **1177** | 🟠 P1 | ≤ 350 |
| `android-app/.../PayoutScreens.kt` | **1092** | 🟠 P1 | ≤ 350 |
| `android-app-customer/.../tracking/TrackingScreen.kt` | **1091** | 🟠 P1 | ≤ 350 |
| `android-app/.../MainScreen.kt` | **1024** | 🔴 P0 | ≤ 300 |
| `android-app/.../OnDemandHubScreens.kt` | **869** | 🟠 P1 | ≤ 350 |
| `backend/order-service/internal/domain/order.go` | **662** | 🟠 P1 | ≤ 300 |
| `backend/admin-service/src/routes.ts` | **619** | 🟡 P2 | ≤ 300 |

---

## 1.1 Backend Admin Controllers

### Task — Split `courierAuth.controller.ts` (5445 baris)
**Status:** ✅ **DONE** — 2026-08-25 (37 fungsi, `tsc --noEmit` + `npm run build` bersih, API publik utuh via facade)

**File lama:** `backend/admin-service/src/controllers/courierAuth.controller.ts` *(sekarang jadi facade `export * from './courier'`)*

**File baru (hasil aktual — 13 controller fokus + 1 shared, lebih granular dari rekomendasi 6 file):**
```
backend/admin-service/src/controllers/courier/
  ├── _shared.ts                        (56 helper level-modul, diekspor sekali)
  ├── courierAuth.controller.ts         (loginCourier, verifyCourierLoginOtp)
  ├── courierProfile.controller.ts      (getMobileCourierProfile, updateMobileCourierCapacity)
  ├── courierDuty.controller.ts         (updateMobileCourierDuty)
  ├── courierOrders.controller.ts       (getMobileCourierOrders)
  ├── courierServices.controller.ts     (getMobileCourierOnDemandServices, getMobileCourierHotspots)
  ├── courierSafety.controller.ts       (createMobileCourierSafetyEvent, TripShare, getPublicTripShare, listAdminCourierSafetyEvents)
  ├── courierEarnings.controller.ts     (ledger, payout summary/requests, createPayoutRequest)
  ├── courierRouting.controller.ts      (routePreview, activeRoutePlan, performance)
  ├── courierGrowth.controller.ts       (listAdminCourierGrowthConfigs, tier config, incentive)
  ├── courierOnDemand.controller.ts     (dispatchNext/ToPreferred/advanceQueue)
  ├── courierOffer.controller.ts        (notifyOffers, get/accept/reject offer)
  ├── courierProof.controller.ts        (verifyFace, scanOrder, uploadPod, serviceReportProof, pickupCancelReasons)
  ├── courierAccount.controller.ts      (statusTransitions, updateOrderStatus, cancelOnDemandPickup)
  └── index.ts                          (barrel)
```
**Shared helpers:** `backend/admin-service/src/controllers/courier/_shared.ts`  
**Update `routes.ts`:** TIDAK PERLU — facade `courierAuth.controller.ts` mempertahankan API `controllers.courierAuth.*` persis, sehingga `routes.ts` & `controllers/index.ts` tidak berubah. 4 test file (`courierAuth.controller.test.ts`, 3 e2e) tetap resolve facade.

### Task — Split `customerOrder.controller.ts` (5065 baris)
**Status:** ✅ **DONE** — 2026-08-25 (39 fungsi, `tsc --noEmit` + `npm run build` bersih, API publik utuh via facade)

**File lama:** `backend/admin-service/src/controllers/customerOrder.controller.ts` *(sekarang jadi facade `export * from './order'`)*

**File baru (hasil aktual — 9 controller fokus + 1 shared, lebih granular dari rekomendasi 7 file):**
```
backend/admin-service/src/controllers/order/
  ├── _shared.ts                            (60 helper level-modul, diekspor sekali)
  ├── customerOrder.controller.ts           (create, cancel, list, getById, retryMatching)
  ├── customerOrderPayment.controller.ts    (paymentSession, paymentStatus, confirm, midtransNotif, calculatePrice(s))
  ├── customerOrderAddress.controller.ts    (create/update/delete/list addresses)
  ├── customerOrderTracking.controller.ts   (tracking, syncCourier, mobileDetail, publicLink, umkmReport, dashboardStats)
  ├── customerOrderChat.controller.ts       (chats, send, markRead, orderCall join/end)
  ├── customerOrderReceiverLocation.controller.ts (receiver location request flow)
  ├── customerOrderMobile.controller.ts     (getMobileCustomerOrders/Order/IncomingPackages)
  ├── customerOrderProfile.controller.ts    (get/update mobile profile, upload photo)
  ├── customerOrderFile.controller.ts       (uploadOrderFile)
  └── index.ts                             (barrel)
```
**Shared helpers:** `backend/admin-service/src/controllers/order/_shared.ts`  
**Update `routes.ts`:** TIDAK PERLU — facade `customerOrder.controller.ts` mempertahankan API `controllers.customerOrder.*` persis. Cross-controller deps (`courierAuth`, `deliveryServices`, `websocket`) di-rewire ke path benar (`../courierAuth.controller`, `../deliveryServices.controller`, `../../websocket`).

---

## 1.2 Order Service (Go)

### Task — Split `order_handler.go` (1541 baris)
**File lama:** `backend/order-service/internal/handler/order_handler.go`

**File baru:**
```
backend/order-service/internal/handler/
  ├── order_handler.go              (core CRUD + status transition ≤350)
  ├── parcel_handler.go
  ├── food_handler.go
  ├── roadside_handler.go           (tambal_ban + towing)
  ├── matching_handler.go
  └── proof_handler.go
```

### Task — Split `order_service.go` (2531 baris)
**File lama:** `backend/order-service/internal/service/order_service.go`

**File baru:**
```
backend/order-service/internal/service/
  ├── order_service.go              (orchestration utama)
  ├── parcel_service.go
  ├── food_service.go
  ├── roadside_service.go
  ├── matching_service.go
  ├── pricing_service.go
  └── settlement_service.go         (review overlap dengan merchant_settlement_service.go)
```

### Task — Split domain `order.go` (662 baris)
```
backend/order-service/internal/domain/
  ├── order.go                  (OrderBase + common + status machine)
  ├── order_parcel.go
  ├── order_food.go
  ├── order_roadside.go
  ├── order_status.go
  └── order_events.go
```

---

## 1.3 Android Courier App

### Task — Split `MainScreen.kt` (1024 baris)
**File lama:** `android-app/app/src/main/java/com/tembus/courier/ui/screens/MainScreen.kt`

**File baru:**
```
android-app/.../ui/screens/
  ├── MainScreen.kt                     (navigation host + top-level state ≤250)
  ├── main/MainBottomNav.kt
  ├── main/MainScaffold.kt
  └── ondemand/OnDemandHomeScreen.kt
```

### Task — Split `OrderDetailScreen.kt` (2557 baris) — PALING BESAR ANDROID
**File lama:** `android-app/.../ui/screens/order/OrderDetailScreen.kt`

**File baru:**
```
android-app/.../ui/screens/order/
  ├── OrderDetailScreen.kt              (orchestrator ≤300)
  ├── OrderDetailHeader.kt
  ├── OrderDetailMapSection.kt
  ├── OrderDetailStatusStepper.kt
  ├── OrderDetailActionButtons.kt
  ├── OrderDetailProofSection.kt
  ├── OrderDetailChatSection.kt
  ├── OrderDetailPaymentInfo.kt
  └── OrderDetailViewModel.kt           (review merge/split dengan OrderViewModel)
```

### Task — Split `OnDemandMapScreens.kt` (1614 baris)
```
android-app/.../ui/screens/ondemand/
  ├── OnDemandMapScreen.kt
  ├── OnDemandNavigationScreen.kt
  ├── OnDemandArrivalConfirmScreen.kt
  └── map/MapOverlayComposables.kt
  └── map/MapCameraController.kt
```

### Task — Split `PayoutScreens.kt` (1092) & `OnDemandHubScreens.kt` (869)
Pecah per screen + bottom sheet + dialog. Target tiap file ≤350 baris.

---

## 1.4 Android Customer App

### Task — Split `BookingScreen.kt` (2495 baris)
```
android-app-customer/.../ui/screens/booking/
  ├── BookingScreen.kt                  (orchestrator)
  ├── BookingAddressSection.kt
  ├── BookingItemDetailsSection.kt
  ├── BookingPricingSection.kt
  ├── BookingPaymentSection.kt
  ├── BookingConfirmationSheet.kt
  └── BookingViewModel.kt
```

### Task — Split `TrackingScreen.kt` (1091 baris)
```
android-app-customer/.../ui/screens/tracking/
  ├── TrackingScreen.kt
  ├── TrackingMapSection.kt
  ├── TrackingStatusCard.kt
  ├── TrackingCourierInfo.kt
  ├── TrackingChatButton.kt
  └── TrackingViewModel.kt
```

---

## 1.5 Admin Dashboard & Frontend

### Task — Split `Finance.tsx` (2622 baris)
```
admin-dashboard/src/pages/finance/
  ├── FinancePage.tsx
  ├── FinanceOverview.tsx
  ├── FinancePayoutTable.tsx
  ├── FinanceLedger.tsx
  ├── FinanceTaxReport.tsx
  └── hooks/useFinanceData.ts
```

### Task — Split `Settings.tsx` (2129 baris)
Pecah per tab/section (General, Pricing, Zones, Notification, Security, dll).

### Task — Frontend Order Detail & Form
- `frontend/src/app/(portal)/orders/[id]/page.tsx` (1530) → pecah ke components
- `frontend/src/components/orders/OnDemandOrderForm.tsx` (1177) → sub-components per step

**Acceptance Criteria semua god-file refactor:**
- Tidak ada file critical path > 400–500 baris
- Tidak ada regression flow
- Test coverage domain logic tidak turun
- PR review minimal 1 orang

---

# BAGIAN 2 — P0 DETAILED TASKS (Release Blocker)

**Timeline: 1–6 minggu**  
**Goal: Hilangkan liability legal + naikkan reliability dasar**

## 2.1 Accessibility (WCAG 2.2 AA) — HIGHEST PRIORITY

### Web (Customer Portal + Admin)
| Action | File / Path |
|--------|-------------|
| Focus ring token | `frontend/src/app/globals.css`, `admin-dashboard/src/index.css` |
| ARIA + keyboard | Semua form & interactive di `frontend/src/components/**`, `admin-dashboard/src/components/**` |
| Alt text enforcement | Wrapper `SafeImage.tsx` / `AccessibleImage.tsx` |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` di globals.css |
| lang="id" | `frontend/src/app/layout.tsx`, `admin-dashboard/index.html` |
| CI a11y | `.github/workflows/*.yml` + `axe-core` / `pa11y-ci` |

**File baru:**
```
frontend/src/components/a11y/
  ├── FocusTrap.tsx
  ├── VisuallyHidden.tsx
  ├── SafeImage.tsx
  └── useAnnounce.ts
admin-dashboard/src/components/a11y/   (mirror)
```

### Android
- Semua composable critical → `Modifier.semantics { contentDescription = ... }`
- Theme tokens di `android-app/.../ui/theme/` & `android-app-customer/.../ui/theme/`

**File baru:**
```
android-app/.../ui/a11y/SemanticsHelpers.kt
android-app/.../ui/a11y/AccessibilityPreview.kt
```

**Acceptance:** axe ≥ 95, TalkBack critical path pass, CI fail kalau critical violation.

---

## 2.2 Resilience Patterns

### Circuit Breaker + Retry + Bulkhead
**Files diubah:**
- `backend/admin-service/src/services/` (external calls)
- `backend/integration-gateway/`
- `backend/order-service/internal/service/`
- `backend/api-gateway/src/`

**File baru:**
```
backend/pkg/resilience/
  ├── circuitbreaker.go
  ├── retry.go
  └── bulkhead.go

backend/admin-service/src/lib/resilience/
  ├── circuitBreaker.ts
  ├── retry.ts
  └── rateLimiter.ts
```

### Rate Limiter
**Primary:** `backend/api-gateway/src/`  
Token-bucket / sliding-window (per IP + per user + per endpoint). Config via env + Redis.

**Acceptance:** Load test dengan dependency failure tidak cascade; rate limit terukur & terdokumentasi.

---

## 2.3 Feature Flags Foundation

**File baru:**
```
backend/admin-service/src/services/featureFlag.service.ts
backend/pkg/featureflag/
frontend/src/lib/featureFlags.ts
android-app/.../featureflag/FeatureFlagManager.kt
android-app-customer/.../featureflag/FeatureFlagManager.kt
```

Integrasi: Unleash / Flagsmith / simple Redis + admin toggle. Semua fitur baru wajib di-flag.

---

## 2.4 Security Quick Wins

| Task | File yang diubah |
|------|------------------|
| Certificate Pinning runtime | `android-app/.../network/`, `android-app-customer/.../network/` (OkHttp Client) |
| Advanced Fake GPS | `android-app/.../location/` (sensor fusion + heuristic) |
| Rate limit | sudah di 2.2 |

---

# BAGIAN 3 — P1 DETAILED TASKS (Production Hardening)

**Timeline: 1–3 bulan**

## 3.1 Observability SRE-Grade
- Extend `observability/otel-collector-config.yml`
- Prometheus / VictoriaMetrics + Grafana dashboards di `observability/grafana/`
- SLO definition: `observability/slo.yaml`
- Alerting → PagerDuty / Opsgenie / Telegram + escalation
- Business metrics (matching time, completion rate, ghosting rate, fraud rate)

## 3.2 Testing Maturity
- Coverage threshold di CI (Go + JS)
- Maestro flows: `android-app/maestro/`, `android-app-customer/maestro/`
- Visual regression (Chromatic / Loki)
- Pact contracts di `contracts/`
- k6 stress + spike + soak test

## 3.3 Android 15 + Modern Mobile UX
- Edge-to-edge + Predictive Back di `MainActivity` / theme
- Credential Manager di auth screens
- Photo Picker di proof/POD screens
- Haptic feedback di action penting
- Pull-to-refresh, ModalBottomSheet, swipe actions
- WindowSizeClass (tablet/foldable minimal)

## 3.4 UI/UX Polish & Design System v2
**File baru:**
```
frontend/src/components/ui/Skeleton.tsx
frontend/src/components/ui/Shimmer.tsx
admin-dashboard/src/components/ui/Skeleton.tsx
android-app/.../ui/components/Skeleton.kt
android-app-customer/.../ui/components/Skeleton.kt
```
Motion tokens di `globals.css` + Compose theme. Shared element transition. Design system docs (Storybook/Ladle).

## 3.5 Security Lanjutan
- WAF di edge
- Secret rotation + Vault / Doppler / AWS Secrets Manager
- Scheduled pentest + bug bounty ringan
- SLSA attestation level 2–3 di CI

---

# BAGIAN 4 — BUILD SIZE & PERFORMANCE OPTIMIZATION

## 4.1 Android APK/AAB Size

| # | Task | File / Action | Expected Impact |
|---|------|---------------|-----------------|
| 1 | Compress & convert images ke WebP | `android-app*/**/res/drawable*/*.png` | -30~50% image |
| 2 | Large images → remote CDN + placeholder | onboarding, splash, hero | -2~5 MB |
| 3 | R8 full mode + resource shrinking | `android-app*/app/build.gradle.kts` | -10~20% code |
| 4 | Audit ProGuard rules | `proguard-rules.pro` | avoid over-keep |
| 5 | Remove unused resources | `./gradlew :app:shrinkReleaseRes` | -5~15% |
| 6 | Language/density split di App Bundle | `bundle { language { enableSplit = true } }` | download ↓ |
| 7 | Hapus file debug dari repo | `logcat_*.txt`, `tmp_*`, `temp.js` | cleanliness |
| 8 | Vector drawable untuk icon | `res/drawable/` | smaller + sharp |
| 9 | abiFilters (armeabi-v7a + arm64-v8a) | `build.gradle.kts` | exclude x86 |
| 10 | Baseline Profile + App Startup | AndroidX Baseline Profile | cold start ↑ |

**Target AAB:** Courier < 25–30 MB, Customer < 20–25 MB (download size).

## 4.2 Web Bundle Size
- Bundle analyzer (`vite-bundle-visualizer` / `next-bundle-analyzer`)
- Dynamic import / code splitting (Finance, Settings, Order Detail)
- Tree-shake Framer Motion & Lucide (import spesifik)
- Next.js Image + WebP
- Font subsetting
- Compression Brotli/Gzip di CDN/nginx

**Target:** First Load JS < 150–200 KB (gzipped) critical pages.

## 4.3 Runtime Performance (Ringan dipakai)
- Lazy load map & heavy components
- Virtualized list (FlashList / LazyColumn) untuk history & list
- Avoid unnecessary recomposition / re-render
- Image caching config (Coil/Glide)
- HTTP/2 + compression + request coalescing

---

# BAGIAN 5 — FLOW-SPECIFIC IMPROVEMENTS

| Flow | Current | Target | Priority Improvements |
|------|---------|--------|-----------------------|
| **Parcel** | 8.5 | 9.0 | Multi-drop advanced, real-time dynamic pricing transparency, carbon estimate, insurance option |
| **Food** | 8.5 | 9.0 | Smarter batching, ML ghost detection, real-time merchant performance, contactless + photo POD polish |
| **Tambal Ban** | 7.5 | 8.5 | Safety check, real-time material cost update, alternative suggestion (towing), AI damage assessment |
| **Towing** | 6.5 | 8.0 | Partner bengkel + booking, insurance claim, pre-existing damage docs, alternative transport credit |

**Cross-flow:** Offline-first robust + conflict resolution, full event audit trail, explicit SLO per flow.

---

# BAGIAN 6 — ARCHITECTURE EVOLUTION (2026 Ready)

**Current:** 9 microservices + API Gateway + integration-gateway, REST, partial CQRS, Socket.IO + FCM + Redis.

**Target (tanpa big-bang):**
1. BFF layer (Mobile BFF + Web BFF) atau GraphQL Gateway
2. Domain events lebih dalam ke message bus
3. Idempotency key universal
4. Outbox + Inbox full coverage
5. Policy as Code (OPA/Cedar) untuk RBAC + ABAC
6. Service mesh (opsional)
7. mTLS antar service

**Prioritas tetap:** a11y → resilience → observability → god-file refactor → build size.

---

# BAGIAN 7 — URUTAN PENGERJAAN (SPRINT)

### Sprint 1–2 (Minggu 1–4) — Foundation
1. God-file refactor paling kritis (controllers 5000+, OrderDetailScreen, BookingScreen, order_handler, order_service, MainScreen)
2. Rate limiter + Circuit breaker
3. Accessibility foundation (tokens + SafeImage + CI)
4. Hapus file sampah (logcat, tmp, temp.js)

### Sprint 3–4 (Minggu 5–8)
5. Lanjutkan god-file refactor sisa
6. Feature flags
7. Certificate pinning runtime + Fake GPS
8. Skeleton + basic a11y di critical screens
9. Android build size optimization (WebP, R8, shrink, split)

### Sprint 5–6 (Minggu 9–12)
10. Observability SRE-grade
11. Android 15 compliance
12. Testing maturity (Maestro, visual regression, coverage threshold)
13. Web bundle optimization
14. Sisa UI polish + flow improvements

---

# BAGIAN 8 — SUCCESS METRICS

| Metric | Target |
|--------|--------|
| Accessibility | axe ≥ 95 + TalkBack critical path pass |
| Observability | 100% critical path ber-SLO + error budget |
| Reliability | Circuit breaker coverage 100% external deps |
| Mobile | Android 15 compliant + edge-to-edge + predictive back |
| Testing | Mobile E2E critical path + visual regression di CI |
| Security | Rate limit + WAF + secret rotation + clean pentest |
| Code Health | Tidak ada critical file > 400–500 baris, coverage ≥ 75% domain |
| Build Size | Courier AAB < 30 MB, Customer < 25 MB, First Load JS < 200 KB |
| Overall Audit | **8.7–9.0 / 10** |

---

# BAGIAN 9 — TEMPLATE TICKET

```
Title: [P0][Refactor] Split OrderDetailScreen.kt (2557 → ≤400 lines)

Description:
File saat ini terlalu besar (2557 baris). Pecah menjadi orchestrator + section components.

Acceptance Criteria:
- [ ] OrderDetailScreen.kt ≤ 300 baris
- [ ] Semua section di file terpisah
- [ ] Tidak ada regression di order detail flow
- [ ] Unit/screenshot test tetap pass
- [ ] PR review oleh minimal 1 orang

Files to create:
- OrderDetailHeader.kt
- OrderDetailMapSection.kt
- OrderDetailStatusStepper.kt
- OrderDetailActionButtons.kt
- OrderDetailProofSection.kt
- OrderDetailChatSection.kt
- OrderDetailPaymentInfo.kt

Files to modify:
- OrderDetailScreen.kt
- OrderViewModel.kt (kalau perlu)

Estimate: L (3–5 hari)
Depends on: -
```

---

# BAGIAN 10 — FEATURE BARU: BROADCAST CENTER (PESAN KE DRIVER) — TARGET 10/10

**Status sekarang:** Ada hanya “Broadcast Undangan Basecamp” (use-case tunggal). Engine FCM sudah solid.  
**Target:** Broadcast Center mature (setara Gojek/Grab announcement tools) — **10/10**.

---

## 10.1 Product Scope (End-to-End)

Admin bisa mengirim pesan/announcement ke kurir dengan:
- Pesan bebas (judul + body + gambar opsional + deep link)
- Target fleksibel: Semua / Online saja / By zona / By role / By capability / Manual select
- Channel: Push (FCM) + In-app notification (+ opsional WhatsApp via Zenziva)
- Scheduling (kirim sekarang / jadwal)
- Draft + approval (opsional role-based)
- Delivery report (success / fail / opened)
- History + audit trail
- Rate limit & safety (anti-spam)

Kurir menerima di:
- FCM push (foreground + background + killed)
- In-app Notification Center
- Deep link ke screen terkait (kalau ada)

---

## 10.2 Admin Web — UI/UX (10/10)

### Halaman baru: `BroadcastCenter` / `Announcements`

**Route:** `/broadcasts`  
**File baru:**
```
admin-dashboard/src/pages/Broadcasts.tsx
admin-dashboard/src/pages/broadcasts/
  ├── BroadcastList.tsx              (history + filter status)
  ├── BroadcastComposer.tsx          (form utama)
  ├── BroadcastTargetPicker.tsx      (segmentasi target)
  ├── BroadcastPreview.tsx           (preview notif di device mock)
  ├── BroadcastDeliveryReport.tsx    (stats per broadcast)
  └── hooks/
      ├── useBroadcasts.ts
      └── useBroadcastTargets.ts
```

**Update routing:**
- `admin-dashboard/src/App.tsx` → tambah route `/broadcasts`
- `admin-dashboard/src/components/DashboardLayout.tsx` → menu item “Broadcast” (icon Megaphone / Radio)

### UI/UX Flow Composer (matang)

1. **Header**
   - Judul “Broadcast Center”
   - Button “Buat Broadcast Baru”

2. **Composer (stepper atau single page dengan section)**
   - **Section 1 — Konten**
     - Title (max 60 char, counter)
     - Body (max 500 char, counter, support line break)
     - Optional image (upload, preview, compress client-side)
     - Deep link (dropdown: Order Detail / Payout / Profile / Custom URL / None)
     - Priority: Low / Normal / High / Urgent
     - Category: System / Promo / Support / Activity / Message

   - **Section 2 — Target**
     - Radio: Semua Kurir | Online Saja | Filter Lanjutan | Manual Select
     - Filter lanjutan:
       - Zona (multi-select)
       - Role (on-demand / pickup-only / delivery-only / roadside)
       - Capability (ROADSIDE_TIRE, dll)
       - Status akun (active / verified)
     - Manual: search + multi-select (reuse pola dari Couriers.tsx)
     - Live counter: “Akan dikirim ke ±X kurir”

   - **Section 3 — Channel & Jadwal**
     - Checkbox: Push FCM | In-app | WhatsApp (opsional)
     - Radio: Kirim Sekarang | Jadwalkan
     - DateTime picker (kalau schedule)
     - Timezone label (WIB)

   - **Section 4 — Preview & Konfirmasi**
     - Mock phone preview (notifikasi push + in-app card)
     - Summary target + channel
     - Button “Simpan Draft” / “Kirim Sekarang” / “Jadwalkan”
     - Confirm modal: “Kirim ke X kurir via Push + In-app?”

3. **List & History**
   - Table/card: judul, status (Draft / Scheduled / Sending / Sent / Failed), target count, success rate, created by, waktu
   - Filter: status, date range, created by
   - Action: Lihat report, Duplicate, Cancel (kalau scheduled)

4. **Delivery Report**
   - Total target / success / failed / opened (kalau trackable)
   - Breakdown per channel
   - List failed tokens (opsional, untuk debug)
   - Export CSV

### Accessibility & Polish
- Full keyboard nav + ARIA
- Skeleton loading
- Empty state yang jelas
- Confirm destructive actions
- Toast feedback
- Optimistic UI di list setelah kirim

---

## 10.3 Backend — API & Engine

### Endpoint baru

| Method | Path | Keterangan |
|--------|------|------------|
| `GET` | `/admin/broadcasts` | List + filter + pagination |
| `GET` | `/admin/broadcasts/:id` | Detail + delivery stats |
| `POST` | `/admin/broadcasts` | Create (draft / schedule / send now) |
| `PATCH` | `/admin/broadcasts/:id` | Update draft / cancel scheduled |
| `POST` | `/admin/broadcasts/:id/send` | Force send draft |
| `GET` | `/admin/broadcasts/:id/report` | Delivery report detail |
| `GET` | `/admin/broadcasts/targets/estimate` | Hitung jumlah target sebelum kirim |

### File baru / diubah

```
backend/admin-service/src/
  ├── controllers/broadcast.controller.ts
  ├── services/broadcast.service.ts
  ├── services/broadcastTarget.service.ts      (query segmentasi)
  ├── services/broadcastDelivery.service.ts    (batch FCM + stats)
  └── routes.ts                                (register routes)

backend/admin-service/migrations/
  └── XXX_create_broadcasts.sql
```

### Schema DB (rekomendasi)

```sql
-- broadcasts
id, title, body, image_url, deep_link, category, priority,
channels (jsonb), target_type, target_filter (jsonb),
status ('draft'|'scheduled'|'sending'|'sent'|'cancelled'|'failed'),
scheduled_at, sent_at, created_by, created_at, updated_at

-- broadcast_recipients (opsional, untuk audit detail)
broadcast_id, user_id, channel, status ('pending'|'sent'|'failed'|'opened'),
error_code, sent_at, opened_at
```

### Logic pengiriman (10/10)

1. Resolve target → list `user_id` (batch, jangan load semua sekaligus kalau >10k)
2. Insert `broadcasts` + status `sending`
3. Batch `createNotification()` yang sudah ada (reuse engine)
   - Atau FCM Topic kalau sudah subscribe (`courier_all`, `courier_zone_{id}`, `courier_online`)
4. Update delivery stats (success/fail)
5. Cleanup invalid tokens (sudah ada di engine)
6. Rate limit: max N broadcast/jam per admin + max recipient per broadcast
7. Job scheduler (Bull / Agenda / cron) untuk `scheduled_at`
8. Audit log setiap create/send/cancel

### Reuse yang sudah ada
- `createNotification()` di `notifications.ts` (DB + WebSocket + FCM Multicast)
- `recordPushDelivery`
- Firebase multi-app (courier target)
- `user_devices` table

### Peningkatan engine (opsional tapi recommended untuk 10/10)
- FCM Topic subscription saat kurir online/offline & join zona
- `opened` tracking (via app open notification / data message callback)
- Idempotency key per broadcast send

---

## 10.4 Android Courier App (Driver) — Penerimaan 10/10

### Yang harus ada

1. **FCM Handler**
   - File: `TEMBUSFirebaseMessagingService.kt` (sudah ada — extend)
   - Handle type baru: `admin_broadcast` / `broadcast`
   - Tampilkan high-priority notification kalau `priority = high/urgent`
   - Deep link routing

2. **In-app Notification Center**
   - Pastikan broadcast muncul di list notifikasi
   - Badge unread
   - Mark as read
   - Tap → buka deep link atau detail pesan

3. **UI Detail Broadcast (opsional tapi bagus)**
   ```
   android-app/.../ui/screens/notification/
     ├── NotificationCenterScreen.kt
     ├── NotificationDetailScreen.kt      (kalau body panjang / ada image)
     └── NotificationViewModel.kt
   ```

4. **UX polish**
   - Rich notification (big text / big picture kalau ada image)
   - Action button (opsional: “Buka”, “Nanti”)
   - Sound / channel importance sesuai priority
   - Tidak mengganggu order aktif (jangan full-screen intent kecuali urgent safety)

5. **Topic subscription (recommended)**
   - Subscribe `courier_all` saat login
   - Subscribe `courier_zone_{zoneId}` saat update lokasi/zona
   - Subscribe/unsubscribe `courier_online` saat toggle online/offline
   - File: `android-app/.../notification/FcmTopicManager.kt`

### File yang disentuh
```
android-app/app/src/main/java/com/tembus/courier/
  ├── service/TEMBUSFirebaseMessagingService.kt   (extend)
  ├── notification/FcmTopicManager.kt               (baru)
  ├── ui/screens/notification/                      (baru / extend)
  └── data/... (notification repository/API)
```

---

## 10.5 Acceptance Criteria (10/10 Checklist)

### Admin
- [ ] Bisa buat broadcast dengan title + body + optional image + deep link
- [ ] Target: semua / online / zona / role / capability / manual
- [ ] Live estimate jumlah penerima
- [ ] Preview notifikasi
- [ ] Kirim sekarang + jadwalkan
- [ ] Draft + cancel scheduled
- [ ] History + filter + delivery report (success/fail rate)
- [ ] Rate limit terasa (tidak bisa spam)
- [ ] Audit trail (siapa kirim apa kapan)
- [ ] a11y + skeleton + empty state

### Backend
- [ ] Endpoint lengkap + auth RBAC (hanya role tertentu)
- [ ] Reuse `createNotification` / FCM engine
- [ ] Batch aman (tidak OOM, timeout handled)
- [ ] Scheduled job jalan
- [ ] Delivery stats akurat
- [ ] Invalid token cleanup
- [ ] Observability (metric broadcast_sent, broadcast_failed)

### Courier App
- [ ] Push muncul (foreground/background/killed)
- [ ] Masuk Notification Center
- [ ] Deep link work
- [ ] Image tampil (kalau ada)
- [ ] Priority high/urgent terasa (channel importance)
- [ ] Tidak ganggu flow order aktif secara agresif
- [ ] Topic subscription stabil (kalau dipakai)

### Non-functional
- [ ] Test: unit + API + E2E admin kirim → kurir terima
- [ ] Load test: 5k–10k recipient tidak timeout
- [ ] Tidak ada regression ke broadcast basecamp lama (bisa diarahkan ke Composer generic atau tetap khusus)

---

## 10.6 Urutan Implementasi (Recommended)

| Phase | Fokus | Estimasi |
|-------|--------|----------|
| **BC-1** | DB migration + backend create/list/send (kirim sekarang, target manual + semua) | 3–5 hari |
| **BC-2** | Admin UI Composer + List + Preview | 4–6 hari |
| **BC-3** | Target filter (zona, role, online, capability) + estimate | 2–3 hari |
| **BC-4** | Courier app: FCM type + Notification Center + deep link | 3–4 hari |
| **BC-5** | Scheduling + draft + cancel | 2–3 hari |
| **BC-6** | Delivery report + audit + rate limit | 2–3 hari |
| **BC-7** | FCM Topic + image rich notif + polish a11y | 2–4 hari |
| **BC-8** | E2E test + load test + docs | 2 hari |

**Total realistis:** ±3–4 minggu (1 engineer full-time) untuk mencapai 9–10/10.

---

## 10.7 Integrasi dengan yang sudah ada

- **Jangan buang** `broadcastOnboardingInvite` — bisa jadi preset template di Composer (“Undangan Basecamp”) atau tetap button khusus di Couriers yang memanggil Composer dengan template terisi.
- **Reuse** `createNotification`, `user_devices`, Firebase multi-app, `recordPushDelivery`.
- **News** tetap untuk konten panjang di dalam app; Broadcast untuk pesan push/announcement singkat.
- **Notification Templates** (`/notifications`) tetap untuk event otomatis (order status, dll); Broadcast untuk pesan manual admin.

---

# BAGIAN 11 — GAP ANALYSIS END-TO-END (Fitur Wajib Belum Ada / Belum Sempurna)

**Scope:** Customer Web · Customer App · Kurir App · Merchant App · Merchant Web · Admin Web  
**Dasar:** struktur repo, PRD gap, mobile readiness docs, inventory screen.

### Maturity per permukaan (baseline)

| Surface | Score | Verdict |
|---------|-------|---------|
| Customer Web | 7.0/10 | Kuat order/tracking; lemah public surface, voucher, laporan, address book |
| Customer App | 7.5/10 | Parcel + Food + Roadside ada; polish & edge case bolong |
| Kurir App | 8.0/10 | Paling mature; god-file & broadcast umum masih gap |
| Merchant App | 6.5/10 | Food ops basic; staff/settlement/report tipis |
| Merchant Web | **3.0/10** | Hampir hanya landing + register + status check |
| Admin Web | 7.5/10 | Ops lengkap; broadcast umum, RBAC, force actions, evidence gap |

---

## 11.1 Customer Web (`frontend/`) — Tasks

### P0
- [ ] **Landing page publik** di `/` (navbar Layanan/Harga/UMKM, CTA Cek Resi/Masuk/Daftar, mobile hamburger)
  - File: `frontend/src/app/page.tsx` (+ komponen landing)
- [ ] **Cek resi publik** `/cek-resi` (input resi, status terbatas, CTA login, rate-limit backend)
  - File baru: `frontend/src/app/cek-resi/page.tsx` + endpoint lookup
- [ ] **Address book backend** (ganti localStorage → CRUD API + sync multi-device)
  - File: `frontend/src/app/(portal)/alamat/page.tsx` + backend address API
- [ ] **Voucher page** `/voucher` (list aktif, input kode, history, auto-apply checkout)
  - File baru: `frontend/src/app/(portal)/voucher/page.tsx`
- [ ] **CSRF protection** untuk semua mutation web session
- [ ] **Maps/geocoding production** di form order (bukan mock)

### P1
- [ ] Notification center penuh (`/notifikasi`: filter, mark all read, deep link, pagination)
- [ ] Laporan/export nyata (Excel/PDF, backend analytics — ganti mock)
  - File: `frontend/src/app/(portal)/laporan/page.tsx`
- [ ] Google/Apple Sign-In web + Remember me + session expiry UX
- [ ] Profile lengkap: foto crop, ganti PIN, login history, logout all devices, referral
- [ ] Reorder dengan validasi harga & availability terbaru
- [ ] Dashboard summary API real (active orders, spending, loyalty, promos) + auto-refresh
- [ ] Align route structure dengan PRD (`/app/...` alias/redirect)

### P2
- [ ] Food order tracking/reorder minimal di web
- [ ] Roadside/Towing status tracking di web
- [ ] Excel import address book (template + validate + preview)

---

## 11.2 Customer App (`android-app-customer/`) — Tasks

### P0
- [ ] **Offline queue + conflict resolution** untuk order & proof
- [ ] **Accessibility TalkBack** di critical path (booking, tracking, payment, POD)
- [ ] Voucher apply UX jelas di checkout
- [ ] Saved addresses sync server (selaras web)

### P1
- [ ] Skeleton/shimmer di semua list & loading
- [ ] Pull-to-refresh konsisten
- [ ] Android 15: edge-to-edge, predictive back, Credential Manager, Photo Picker
- [ ] Haptic feedback action penting
- [ ] Notification Center mature (filter, mark all, deep link broadcast)
- [ ] **Towing flow polish** (partner bengkel, damage report, insurance claim hook)
- [ ] **Tambal Ban:** safety check lokasi, real-time material cost, saran alternatif towing
- [ ] Multi-stop / multi-drop UX
- [ ] Insurance option di parcel high-value

### P2
- [ ] Shared element transition, WindowSizeClass tablet/foldable
- [ ] Per-app language config lengkap

---

## 11.3 Kurir App (`android-app/`) — Tasks

### P0
- [ ] **Terima Broadcast Center** (FCM type `admin_broadcast`, Inbox, deep link) — lihat BAGIAN 10
- [ ] God-file refactor: `OrderDetailScreen.kt` (2557), `MainScreen.kt` (1024), `OnDemandMapScreens.kt` (1614), dll
- [ ] Certificate pinning **runtime** attach ke OkHttp
- [ ] Fake GPS detection advanced (sensor fusion)

### P1
- [ ] Batching multi-order UX jelas (urutan pickup/delivery)
- [ ] Ghosting penalty & earnings breakdown transparan
- [ ] Roadside proof flow lengkap (before/after + material list)
- [ ] Android 15 compliance + haptic + pull-to-refresh
- [ ] a11y TalkBack critical path
- [ ] Shift / availability preference (opsional supply planning)

### P2
- [ ] In-app SOP / learning singkat onboarding
- [ ] FCM Topic subscription (`courier_all`, `courier_zone_*`, `courier_online`)

---

## 11.4 Merchant App (`android-app-merchant/`) — Tasks

### P0
- [ ] **Order alert reliable** (foreground + background + killed) — SLA accept 3 menit
- [ ] Prep timer + **mark food ready** yang jelas (trigger matching driver)
- [ ] **Partial reject / item unavailable** → partial refund customer

### P1
- [ ] Staff role & permission matang (multi-kasir)
- [ ] Busy mode / pause orders
- [ ] Sold-out / inventory cepat per item
- [ ] Settlement & tax report jelas di app
- [ ] Performance dashboard (accept rate, cancel, rating)
- [ ] Printer Bluetooth thermal stabil (EscPos sudah ada — harden)
- [ ] Chat customer + driver konteks order

### P2
- [ ] Offline mode terbatas (lihat order terakhir)
- [ ] Menu bulk import

---

## 11.5 Merchant Web (`merchant-web/`) — Tasks

**Status sekarang:** Landing + Register + StatusCheck + Success saja (**3/10**).

### P0 (Merchant Portal v1 — minimal viable ops)
- [ ] **Auth + dashboard web** setelah register approved
- [ ] **Order management web** (list, accept/reject, mark ready)
- [ ] **Menu management web** (CRUD + variant)
- [ ] Toggle buka/tutup + jam operasional

**File baru (rekomendasi):**
```
merchant-web/src/pages/
  ├── Dashboard.tsx
  ├── Orders.tsx
  ├── Menu.tsx
  ├── Settings.tsx
  └── Login.tsx
merchant-web/src/components/
  ├── OrderCard.tsx
  ├── MenuEditor.tsx
  └── ...
```

### P1
- [ ] Promo management web
- [ ] Settlement & withdraw web
- [ ] Staff management web
- [ ] Laporan sederhana + export
- [ ] Struk/print dari web (opsional)

### P2
- [ ] Bulk menu import, advanced analytics

---

## 11.6 Admin Web (`admin-dashboard/`) — Tasks

### P0
- [ ] **Broadcast Center** penuh (BAGIAN 10) — ganti ketergantungan “undangan basecamp only”
- [ ] **Force cancel + refund flow** jelas (reason, partial/full, audit)
- [ ] **RBAC multi-role** end-to-end (ops / finance / support / superadmin)

### P1
- [ ] Evidence viewer (foto POD, GPS trail, chat log) untuk dispute
- [ ] GPS spoofing / geofence alert **actionable** (bukan hanya log)
- [ ] Live ops map (semua kurir online + order aktif) sebagai command center
- [ ] Meeting point management
- [ ] Feature flag control UI penuh di admin
- [ ] Delivery report broadcast + audit

### P2
- [ ] Custom report builder
- [ ] Courier churn / retraining workflow
- [ ] Campaign calendar (promo + broadcast)
- [ ] SLO / error budget dashboard

---

## 11.7 Cross-cutting (semua surface) — Tasks

| Priority | Task |
|----------|------|
| P0 | Accessibility WCAG 2.2 AA (web + Android critical path) |
| P0 | Rate limiter + circuit breaker + retry backoff |
| P0 | God-file refactor (controllers 5k baris, screen 1k–2.5k baris) |
| P1 | Observability SRE: SLO, Grafana, alerting |
| P1 | Feature flags standar di semua deploy berisiko |
| P1 | Build size: WebP, R8 full, resource shrink, hapus logcat/tmp dari repo |
| P1 | Contract testing mobile ↔ API (Pact) |
| P1 | Mobile E2E (Maestro) critical flows |
| P2 | iOS decision (strategis jangka menengah) |
| P2 | Multi-bahasa konsisten |
| P2 | Support ticket inbox terintegrasi (beyond dispute) |

---

## 11.8 Flow end-to-end yang masih bolong (prioritas perbaikan)

| Flow | Bolong utama | Surface terdampak |
|------|----------------|-------------------|
| **Parcel** | Address book backend, voucher discoverability, public cek resi, insurance | Customer Web/App, Admin |
| **Food** | Merchant alert SLA, partial item, settlement clarity, voucher | Merchant App/Web, Customer App, Admin |
| **Tambal Ban** | Safety check, material cost real-time, alternatif towing | Customer App, Kurir App |
| **Towing** | Depth terendah: partner bengkel, insurance, damage report | Customer App, Kurir App, Admin |
| **Courier earning** | Breakdown + ghosting transparency | Kurir App, Admin Finance |
| **Admin ops** | Broadcast umum, force cancel/refund, evidence-centric dispute | Admin Web |
| **Merchant day-2** | Web hanya register; ops harian bergantung app | Merchant Web/App |

---

## 11.9 Urutan eksekusi gap (selaras sprint)

**Sprint 1–2 (bersama P0 existing):**  
Broadcast Center foundation · Customer Web landing + cek resi · Address book backend · Rate limit/circuit breaker · God-file terburuk · Merchant order alert + ready flow

**Sprint 3–4:**  
Voucher page web + app · Force cancel/refund admin · RBAC · Partial reject merchant · Customer App skeleton + offline · Certificate pinning + fake GPS

**Sprint 5–6:**  
Merchant Web Portal v1 (dashboard + orders + menu) · Towing/Tambal Ban polish · Evidence viewer · Observability SLO · Android 15 · Build size

**Sprint 7+:**  
Custom reports · Campaign calendar · Merchant web settlement/staff · iOS decision · Support inbox

---

# BAGIAN 12 — RINGKASAN STRATEGIS

**Yang sudah bagus (pertahankan):**
- Multi-service architecture + clean separation
- Security maturity (fraud prevention, audit trail, Argon2id, dll)
- Feature completeness Parcel + Food (fondasi)
- Modern tech stack + 8-phase CI/CD
- FCM notification engine (multicast, category, priority, token cleanup)
- Kurir app flow on-demand relatif mature

**Yang harus dinaikkan segera:**
1. Accessibility (legal risk tertinggi)
2. Resilience patterns (circuit breaker + rate limit)
3. God-file refactor (ada file 5000+ baris)
4. Observability SRE-level
5. Android 15 + UI polish + build size
6. **Broadcast Center** (pesan ke driver) — 4.5/10 → 10/10
7. **Customer Web public surface** (landing, cek resi, voucher, address book)
8. **Merchant Web Portal** (dari 3/10 → minimal ops dashboard)
9. **Merchant App SLA** (alert, ready, partial reject)
10. **Roadside/Towing depth** + Admin force actions / evidence

**Potensi:** Dengan eksekusi P0 + P1 + Broadcast Center + gap surface di atas secara disiplin, TEMBUS bisa naik dari “Gojek 2018-level” ke **2025–2026 ready** dalam 6–9 bulan **tanpa rewrite besar**.

---

*Dokumen tunggal ini menggabungkan:*
- Industry Analysis baseline
- Roadmap prioritas P0/P1/P2
- Detailed task + nama file yang harus diubah/ditambah
- God-file refactor lengkap
- Build size & performance optimization
- Sprint plan + success metrics + ticket template
- Broadcast Center end-to-end (Admin → Backend → Courier) target 10/10
- **Gap analysis end-to-end semua surface (Customer Web/App, Kurir, Merchant App/Web, Admin) + task checklist**

*Generated & consolidated: 2026-08-25*
