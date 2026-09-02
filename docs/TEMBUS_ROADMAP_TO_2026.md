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
| Observability | 8.0/10 | 🟢 Implemented | OTel → Prometheus, Grafana provisioning, SLO recording rules + alerts; deploy validation pending |
| UI/UX Design System | 7.5/10 | 🟢 Good | Design tokens + glassmorphism |
| UI/UX Interaction | 6.5/10 | 🟡 Moderate | Framer Motion ada, polish kurang |
| Accessibility (a11y) | **5.5/10** | 🟠 Below Average | **Tidak WCAG 2.2 AA** |
| Mobile UX (Android) | 7.0/10 | 🟢 Good | Compose modern, Android 15 gap |
| Flow Completeness | 8.0/10 | 🟢 Good | 4 flows lengkap |
| Flow Reliability | 7.5/10 | 🟢 Good | Offline-first, race condition risk |

**Strengths utama:** Arsitektur multi-service, security-first, feature completeness Parcel + Food, modern stack (Go, Next.js, Compose, Tailwind v4).  
**Weaknesses kritis:** Accessibility, resilience patterns, observability SRE-level, god files, Android 15 compliance, UI polish, ukuran build.

---

## 🔍 STATUS EKSEKUSI — HASIL AUDIT KODEBASE (2026-08-25)

Verifikasi langsung ke kode (bukan asumsi). Legend: ✅ selesai · 🟡 parsial · ❌ belum.

**Audit update 2026-09-01:** status di dokumen ini diselaraskan dengan source, test/build lokal, konfigurasi CI terbaru, dan smoke device API 37. Item yang memerlukan credential Firebase, Docker runtime, provider/partner eksternal, atau environment load-test sengaja tetap 🟡/🔴 sampai bukti eksekusinya tersedia.

**Checklist snapshot 2026-09-01:** 93 item `[x]` selesai, 17 item `[~]` partial/menunggu validasi, dan 0 item `[ ]` belum dikerjakan. Angka ini dihitung ulang dari seluruh checkbox eksekusi setelah audit terakhir; acceptance criteria di bagian template ticket tidak dihitung sebagai status proyek.

**Runbook akses eksternal:** detail owner, prerequisite, langkah eksekusi, evidence, exit gate, dan template laporan untuk seluruh 17 item partial tersedia di [ROADMAP_EXTERNAL_ACCESS_CHECKLIST.md](./ROADMAP_EXTERNAL_ACCESS_CHECKLIST.md). Status pada runbook sengaja dimulai dari `TODO` dan hanya boleh menjadi `PASS` setelah evidence eksternal tersedia.

| Bagian | Item | Status |
|---|---|---|
| 11.6 | Customer mobile UI/UX audit 2026 (static) | ✅ **DONE 2026-08-28** — Phase 0/1/4(static) + remediation: OLD_BRAND purged (e650557), NAV-01 fixed, 82/121 Tailwind-gray → M3 tokens (11763eb+116945a), 112 `cd=null` classified (05-accessibility), scorecard (01-scorecard). compileDebugKotlin+testDebugUnitTest GREEN. API 37 customer login-surface smoke now verified 2026-09-01; full device phases 2/4/5/6 and prod-scale sign-off remain outside this static audit. |
| 12.0 | Dependabot HIGH (landing-page) | ✅ **DONE 2026-08-28** — `nanoid` CVE-2026-67213 (transitive via postcss) + `js-yaml` GHSA-5p4m-2wfm-xmqj (transitive via @eslint/eslintrc, O(n²) DoS). Fix: postcss override 8.5.25→8.5.26 (nanoid 3.3.18) + `overrides.js-yaml:4.3.1` (eslintrc still pins ^4.3.0). `npm install`→0 vuln, `next build` EXIT 0, `gh api dependabot/alerts`→0 open. Commit `1010b44`. Alert di `main` clear setelah PR staging→main. |
| 11.1 | **[AUDIT 2026-08-27] Brand-consistency web A1** | ✅ **DONE 2026-08-28** — 14 `blue-500` non-brand occurrence di 10 file → token `primary`/`info` (glow=bg-primary/10, info state=bg-info/10 text-info, selected=border-primary). Palette brand emerald sekarang punya token `brand-emerald-*`, dan seluruh pemakaian frontend sudah dimigrasikan. `npm run build` EXIT 0. |
| 1 | Split `customerOrder.controller.ts` | ✅ |
| 1 | Split `order_service.go` | ✅ |
| CORE-2026-004 | Canonical state machine + actor authorization | ✅ **DONE 2026-09-02** — implementation d1b9e692, `go test ./...` PASS, `go vet ./...` PASS, isolated PostgreSQL concurrency/replay/proof/admin/assignment tests PASS |
| CORE-2026-005 | Payment/refund/payout/settlement/reconciliation invariants | ✅ **DONE 2026-09-02** — implementation 12e7e9fe, `go test ./...` PASS, `npm test` 233 tests PASS, local PostgreSQL reconciliation + exception queue verified |
| 1 | OnDemandMapScreens / PayoutScreens / HubScreens | ✅ SPLIT DONE — facade files 160/159/159 lines + extracted composables; compile verified 2026-08-26 |
| 1 | Split `order_handler.go` | ✅ DONE (346 baris + 4 handler) |
| 1 | Split domain `order.go` | ✅ DONE (order.go 444 + order_food.go 237) |
| 1 | Split OrderDetailScreen.kt (kurir) | ✅ DONE — 2557→2444→**336** (`OrderDetailScreen.kt` pkg+imports+main) + 30 composable files (≤147) + `OrderDetailHelpers.kt` (141) + `OrderDetailComponents.kt` KEPT (shared defs). `compileDebugKotlin` BUILD SUCCESSFUL 2026-08-26 |
| 1 | Split BookingScreen.kt (customer) | ✅ DONE 2026-08-31 — 2495 → **349**; modal sheets and step content extracted into dedicated same-package composables; customer compile + unit tests green |
| 1 | Split OnDemandMapScreens.kt (courier) | ✅ DONE — legacy file is a 160-line facade; extracted screens/components compile successfully |
| 1 | Split TrackingScreen.kt | ✅ DONE 2026-08-31 — 1091 → **327** + `TrackingComponents.kt` + `TrackingDetailSections.kt` + 15 logic tests; customer compile + unit tests green |
| 1 | Split MainScreen.kt (courier) | ✅ DONE 2026-08-31 — 966 → **258**; state/runtime dan Scaffold/content dipisah ke modul terfokus; courier compile + unit tests green |
| 1 | Split Finance.tsx / Settings.tsx | ✅ **DONE 2026-08-27** — TreasuryPanel.tsx 1054→9 section files (`finance/treasury/`: ServiceSettlement, AutoPayoutControl, ManualReviewSection, PayoutAccounts, RekeningGrid, EmergencyFund, PayoutReviews, PayoutGateway, TaxCompliance — all ≤400 LOC) + SettingsContent.tsx 2135→`useSettingsData` hook + 11 tab panels (`settings/`: general, logisticsawb, mapsprovider, featureflags, slaconfig, insurance, walletfees, parameters, security, team, auditlogs — all ≤400 LOC). Local `npm run build` EXIT 0 + CI/CD Staging GREEN (run 33042908191, branch `feat/finance-resplit`). Commits `45ad916`(Finance) + `fc65818`(Treasury+Settings). |
| 1 | Split orders/[id]/page.tsx & OnDemandOrderForm.tsx | ✅ **DONE 2026-09-01** — `orders/[id]/page.tsx` 120 baris dengan runtime state/effects/handlers di `useOrderDetailRuntime.ts` (259 baris), dan `OnDemandOrderForm.tsx` 65 baris dengan state/form polling di `useOnDemandOrderFormRuntime.ts` (241 baris); `OrderDetailContent.tsx`/`OnDemandOrderFormContent.tsx` tetap pure render. Frontend `tsc --noEmit` + `next build` PASS |
| 1 | Split routes.ts admin-service | ✅ **DONE 2026-08-26** — 642→68-line aggregator + `routes/{auth,courier,notification,order,admin,public}.routes.ts`; `tsc --noEmit` EXIT 0, `npm test` 165/165 PASS. Preserved `requireAuth`/`requireTotp` gates |
| 2.1 | Accessibility WCAG 2.2 AA | 🟡 PARTIAL — web foundation and selected Android critical actions wired; local axe scan for landing/login reports 0 WCAG violations, but full TalkBack/Lighthouse critical-path validation remains |
| 2.2 | Circuit breaker + retry + bulkhead | 🟡 **IMPLEMENTED ON CORE + LEGACY HTTP/WEBSOCKET GATEWAY PATHS 2026-09-01** — gateway breaker failure signaling fixed; `proxyWithResilience` covers core routes, `directProxyResilience` covers legacy HTTP proxy surfaces, and `webSocketUpgrade` protects `/socket.io` with circuit-open gate, bounded bulkhead, and close/error-safe release; gateway rate limits now support atomic Redis-backed counters when `REDIS_URL` is configured and two independent local Node processes observed the shared Redis counter; remaining gap is staging multi-replica load evidence |
| 2.2 | Rate limiter api-gateway | ✅ — Redis-backed atomic store (`INCR` + TTL Lua) with isolated memory fallback for local development; Compose supplies `REDIS_URL` and gateway resilience tests pass |
| 2.3 | Feature flags | ✅ backend+admin ✅, client SDK ✅ (commit `54af2e0`: `frontend/src/lib/featureFlags.ts`, `useFeatureFlag.ts`, Android `featureflag/`) |
| 2.4 | Certificate pinning runtime OkHttp | ✅ |
| 2.4 | Fake GPS sensor fusion | ✅ |
| 3.1 | Observability SRE (SLO/Grafana) | 🟡 IMPLEMENTED + LOCAL RUNTIME VERIFIED 2026-09-01 — OTel Prometheus exporter, Prometheus scrape/rules, SLO recording rules, Grafana datasource/dashboard, Docker/CI wiring, and local compose health probes are green (gateway/auth/routing/order/payment/merchant/admin/Jaeger). Deployment/provider alert delivery validation remains |
| 3.2 | Coverage threshold CI | 🟡 PARTIAL — Go (auth+routing) coverage measurement added to `pr-quality.yml` (coverprofile + artifact upload, 2026-08-26). Admin-service functional staging/production tests now explicitly disable accidental coverage collection; full suite is 36 suites/194 tests PASS and all configured security-file floors pass in targeted coverage, while `npm run test:coverage` still fails the global 50% floor. Hard 90% global gate and TS/Android coverage are still pending baseline/test authoring |
| 3.2 | Maestro / Pact / mobile visual regression | 🟡 PARTIAL — Percy browser snapshot coverage sekarang tersedia untuk landing + login, Playwright axe regression `test:e2e:a11y` 2/2 PASS dan job CI sudah menjalankan keduanya; Maestro/Pact, snapshot mobile, serta run Percy dengan credential masih perlu diselesaikan |
| 3.2 | k6 stress/spike/soak | ✅ |
| 3.3 | Edge-to-edge + targetSdk 36 | ✅ — customer, courier, dan merchant debug APK berhasil build/install; login surface customer/courier/merchant launch smoke API 37 terverifikasi 2026-09-01; merchant locale runtime juga sudah Activity-context-safe |
| 3.3 | Predictive back manifest flag | ✅ DONE — `enableOnBackInvokedCallback=true` on courier, customer, and merchant MainActivity manifests |
| 3.4 | Skeleton Android | ✅ (hand-rolled) |
| 3.4 | Skeleton web | ✅ DONE 2026-08-31 — customer page-level loading, portal auth shell, order list Suspense, food validation, aggregator tariffs, MenuEditor, Dispute Chat, Payment Links, On-Demand services, Order Detail, merchant initial pages, and admin data pages use shared skeletons; remaining spinners are transactional submit/upload/refresh actions |
| 4.1 | R8 + shrinkResources | ✅ |
| 4.1 | abiFilters exclude x86/x86_64 | ✅ DONE — customer, courier, and merchant `build.gradle.kts` ship only `armeabi-v7a` + `arm64-v8a`; merchant build verified 2026-08-31 |
| 4.1 | Bundle splits / Baseline Profile / WebP | ✅ **DONE 2026-08-28** — 57 source PNG + build intermediates → WebP (0 fail); Baseline Profile ✅ (`baseline-prof.txt` + `profileinstaller` dep, commit `377968c`); `assembleDebug` customer/courier/merchant all BUILD SUCCESSFUL |
| 4.1 | Junk files cleanup | ✅ DONE — `android-app-customer/logcat2.txt` removed 2026-08-26 (commit `a63e151`); earlier `temp.js`/`logcat_*.txt`/`tmp_*` removed `54af2e0` |
| 10 | Broadcast Center end-to-end | 🟡 PARTIAL — backend + admin UI + scheduler + rate limit + delivery report + audit ✅; kurir app handler type/topic/deeplink/image/priority ✅ (local verified); device E2E kurir↔admin, load execution, dan a11y polish masih pending |
| 11.1 | Address book backend API | ✅ |
| 11.1 | Laporan/export nyata (UMKM analytics) | ✅ |
| 11.1 | Cek resi publik / voucher page / landing utuh | ✅ DONE — public `/`, `/cek-resi`, portal `/voucher` routes exist and frontend build passes; public tracking endpoint is rate-limited |
| 11.3 | Cert pinning + fake GPS kurir | ✅ |
| 11.4 | Mark food ready (FB-125) | ✅ |
| 11.4 | Order alert FCM merchant | 🔴 BLOCKED — backend FCM engine exists, but merchant app still lacks Firebase project config (`google-services.json`/credentials); foreground polling remains the honest fallback |
| 11.4 | Partial reject UI | ✅ **DONE 2026-08-31** — merchant endpoint `/api/v1/merchant/orders/{id}/items/unavailable` validates ownership and item quantity against the server snapshot, delegates price calculation/refund to order-service, records `item_unavailable_refunded`, notifies customer, and Android dashboard exposes item selection + reason. Backend unit tests and Android compile/unit test pass. |
| 11.5 | Merchant Web Portal v1 | 🟡 IMPLEMENTED P0/P1 — auth/dashboard, orders, menu, settings, promo, reports/export, settlement/withdraw, staff, print, bulk import, and database-backed advanced report metrics are API-wired; production data verification remains |
| 11.6 | Feature flag control UI admin | ✅ — `/feature-flags` route and Settings controls are registered; production role-matrix verification remains |
| 11.6 | RBAC multi-role | 🟡 |
| 11.1 | Voucher page web (`/voucher`) | ✅ **VERIFIED 2026-08-26** — `frontend/src/app/(portal)/voucher/page.tsx` exists + `frontend build` EXIT 0 |
| 11.1 | Cek resi publik endpoint + page | ✅ DONE — `/api/v1/tracking/public` + `publicTracking.controller.ts` + `/cek-resi`; route regression fixed and tests pass |
| 11.1 | Landing page publik utuh | ✅ DONE — active frontend `/` route owns the public landing flow; legacy separate `landing-page/` is not the deployed route |

### Verifikasi Build & Test — 2026-08-26 (Hermes Agent)
Semua claim ✅ di atas diverifikasi dengan build/test nyata (bukan asumsi):
- `backend/order-service`: `go build ./...` **EXIT 0** — handler terpecah (`order_handler.go` 346, `parcel_handler.go` 470, `food_handler.go` 193, `matching_handler.go` 148, `proof_handler.go` 442 baris) + service (`order_*.go` 9 file) + domain (`order.go` 461 + `order_food.go` 238). ✅
- `backend/admin-service`: `tsc --noEmit` **EXIT 0** + `npm test` **31 suites / 165 tests PASSED** (sebelumnya 1 suite gagal). Controller `courier/` (13 file) + `order/` (9 file) terpecah beneran. ✅
- `frontend`: `npm run build` **EXIT 0** — route `/voucher`, `/alamat`, `/laporan` ter-build. ✅

**BUG FIX 2026-08-26 — `routes.test.ts` broken (regression dari commit 54af2e0):**
- Symptom: `TypeError: Cannot read properties of undefined (reading 'publicTrackingRateLimiter')` saat load `routes.ts`.
- Root cause: `routes.ts:68` lewatkan `controllers.publicTracking.publicTrackingRateLimiter` **langsung** sebagai middleware reference (dievaluasi saat module load), padahal semua route lain pakai arrow wrapper (lazy, dievaluasi saat request). Saat `routes.ts` di-load pertama kali, `controllers.publicTracking` masih `undefined` (circular init di `controllers/index`).
- Fix: bungkus jadi `(req,res,next)=>controllers.publicTracking.publicTrackingRateLimiter(req,res,next)` (lazy) — konsisten dengan pola route lain. Plus extract `customerOrderStatusLabel` ke leaf `order/statusLabels.ts` (dependency-free) utk putus circular graph `order/_shared ↔ courierAuth.controller`.
- Verifikasi: `routes.test.ts` 14 passed; full suite 165 passed. ✅
| 11.6 | Evidence viewer | ✅ DONE locally — POD/chat/proofs plus trusted GPS trail playback are returned from the admin order detail API and rendered in the evidence viewer; staging data verification remains |
| 11.6 | Force cancel + refund flow | ✅ DONE locally — backend transaction/refund/audit path plus Admin Orders UI; staging DB/TOTP execution remains deployment verification |

Detail per task: lihat baris **Status** di masing-masing seksi di bawah.

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
| `backend/admin-service/src/controllers/courierAuth.controller.ts` | **4** (facade) | ✅ DONE | ≤ 300–400 |
| `backend/admin-service/src/controllers/customerOrder.controller.ts` | **4** (facade) | ✅ DONE | ≤ 300–400 |
| `admin-dashboard/src/pages/Finance.tsx` | **9** (facade) | ✅ DONE | ≤ 400 |
| `android-app/.../order/OrderDetailScreen.kt` | **336** | ✅ DONE | ≤ 400 |
| `backend/order-service/internal/service/order_service.go` | **318** | ✅ DONE | ≤ 400 |
| `android-app-customer/.../booking/BookingScreen.kt` | **349** | ✅ DONE | ≤ 400 |
| `admin-dashboard/src/pages/Settings.tsx` | **7** (facade) | ✅ DONE | ≤ 400 |
| `android-app/.../OnDemandMapScreens.kt` | **160** (facade) | ✅ DONE | ≤ 400 |
| `backend/order-service/internal/handler/order_handler.go` | **346** | ✅ DONE | ≤ 350 |
| `frontend/src/app/(portal)/orders/[id]/page.tsx` | **120** + `useOrderDetailRuntime.ts` 259 | ✅ DONE | ≤ 400 |
| `frontend/src/components/orders/OnDemandOrderForm.tsx` | **65** + `useOnDemandOrderFormRuntime.ts` 241 + extracted content | ✅ DONE | ≤ 350 |
| `android-app/.../PayoutScreens.kt` | **160** (facade) | ✅ DONE | ≤ 350 |
| `android-app-customer/.../tracking/TrackingScreen.kt` | **327** (refactor 1091→327) | ✅ DONE | ≤ 350 |
| `android-app/.../MainScreen.kt` | **258** (8 file ekstraksi terhubung; compile green) | ✅ DONE | ≤300 | state/runtime dan rendering dipisah |
| `android-app/.../OnDemandHubScreens.kt` | **160** (facade) | ✅ DONE | ≤ 350 |
| `backend/order-service/internal/domain/order.go` | **444** + `order_food.go` | ✅ DONE | ≤ 300 |
| `backend/admin-service/src/routes.ts` | **61** (aggregator) | ✅ DONE | ≤ 300 |

---

## 1.1 Backend Admin Controllers

### Task — Split `courierAuth.controller.ts` (5445 baris)
**Status:** ✅ **DONE** — 2026-08-25 (37 fungsi, `tsc --noEmit` + `npm run build` bersih, API publik utuh via facade)

### Task — Split `customerOrder.controller.ts` (5065 baris)
**Status:** ✅ **DONE** — 2026-08-25 (39 fungsi, `tsc --noEmit` + `npm run build` bersih, API publik utuh via facade)

---

## 1.2 Order Service (Go)

### Task — Split `order_handler.go` (1541 baris)
**Status:** ✅ **DONE** — 2026-08-25 (1541 → **346 baris** di `order_handler.go` + 4 file handler, `go build ./...` EXIT 0, nol perubahan API publik karena same-package split).

**File lama:** `backend/order-service/internal/handler/order_handler.go`

**File baru (aktual — 31 method dipindah, 2 fungsi tetap di order_handler.go):**
```
backend/order-service/internal/handler/
  ├── order_handler.go              (struct + NewOrderHandler + userSafeError + core CRUD)
  ├── parcel_handler.go             (Estimate, CreateOrder, CreateBulkOrder, GetOrder, ReorderCheck, ListOrders, PollOrderUpdates, SuggestMeetingPoints, AcceptOrder, UpdateStatus)
  ├── food_handler.go               (CreateFoodOrder, List/Get/Del FavoriteMerchant, CheckIsFavoriteMerchant)
  ├── matching_handler.go           (StartMatching, RetryMatching, InternalStart/RetryMatching)
  └── proof_handler.go              (ScanPackage, consolidation bag, AutoDetectScanType, SubmitCourier/MerchantRating, GetRatingReminders, GetCourierPerformance)
```
**Catatan:** `roadside_handler.go` tidak dibuat karena logic roadside sudah di `tambalban_handler.go` (sudah terpisah sebelumnya).

### Task — Split `order_service.go` (2531 baris)
**Status:** ✅ **DONE** — 2026-08-25 (2531 → **318 baris** di `order_service.go` + 9 file `order_*.go`, `go build ./internal/service/` EXIT 0, nol perubahan API publik karena same-package split).

**File lama:** `backend/order-service/internal/service/order_service.go`

**File baru (aktual — 50 method dipindah, 8 setter tetap di order_service.go):**
```
backend/order-service/internal/service/
  ├── order_service.go              (struct + NewOrderService + 8 setter + standalone helpers)
  ├── order_create.go               (CreateOrder, CreateInternalAggregatorOrder, CreateBulkOrder)
  ├── order_read.go                 (GetOrder, ListOrders, GetCourierIDByUserID, UpdateStatus, UpdateDimensions)
  ├── order_matching.go             (AcceptOrder, FindAndAssignCourier, scoreCouriers, proximityScoreFromDistance, notify*, StartMatching, RetryMatching)
  ├── order_consolidation.go        (ListEvents, ScanPackage, consolidation bag, AutoDetectScanType)
  ├── order_rating.go               (SubmitRating, SubmitMerchantRating, GetOrdersNeedingRatingReminder, GetCourierPerformanceStats)
  ├── order_food.go                 (CreateFoodOrder, AcceptByMerchant, RejectByMerchant, triggerRefundOnCancel, ProcessFood*, PairFoodBatches)
  ├── order_events.go               (publishOrderEvent)
  └── order_food_merchant.go        (ListFoodMerchants, GetFoodMerchantDetail, FavoriteMerchant*, CheckReorder)
```
**Catatan:** `merchant_settlement_service.go` = 756 baris masih besar (follow-up terpisah, bukan blocker god-file utama).

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
**Status:** ✅ **DONE** — 2026-08-25 (662 → **461 baris** di `order.go` + `order_food.go` 238 baris, `go build ./...` EXIT 0, nol perubahan behavior karena pure type declarations di same-package).

**File lama:** `backend/order-service/internal/domain/order.go`

**File baru (aktual — 14 food types dipindah, 16 core types tetap di order.go):**
```
backend/order-service/internal/domain/
  ├── order.go          (OrderStatus, Order, CourierInfo, CreateOrderRequest, SubmitRatingRequest,
  │                     BulkOrderDestination, CreateBulkOrderRequest, OrderService + OrderRepository
  │                     interface, MeetingPoint*, OrderEvent*, PackageScan, ConsolidationBag)
  └── order_food.go     (FoodOrderItemRequest, CreateFoodOrderRequest, FoodOrderItem(+Variant),
                         FoodMerchantInfo, FoodMenuItemInfo, MenuItemVariant(+Option), ReorderCheck*,
                         FoodRepository interface, ScheduledFoodOrder, FoodBatch)
```
**Catatan:** `order_parcel.go`/`order_roadside.go`/`order_status.go`/`order_events.go` tidak dibuat terpisah karena parcel = core Order (sudah di order.go) dan roadside types ada di `tambalban.go`; pemisahan lebih lanjut bersifat kosmetik, bukan blocker.

---

## 1.3 Android Courier App

> **⚠️ BASELINE REPAIR (2026-08-26):** Modul Android `staging` ternyata TIDAK compile karena sesi refactor sebelumnya menghapus `OnDemandMapScreens.kt` / `PayoutScreens.kt` / `OnDemandHubScreens.kt` (roadmap tandai ✅ "terdistribusi") tapi meninggalkan reference ke symbol yang hilang di `MainScreen.kt` / `MainScreenEffects.kt` / `MainScreenModalScreens.kt` / `WalletScreens.kt` / `ProfileScreens.kt`. Symbol yang di-recreate (dari git history `cfdf1d0`/`852e73a`): `ACTIVE_ON_DEMAND_STATUSES`, `DutyLocation`, `hasForegroundLocationPermission`, `hasBackgroundLocationPermission`, `getLastKnownDutyLocation`, `resolveMaxActiveOnDemandJobs`, `normalizedVehicleGroup`, `PUSH_SYNC_MIN_INTERVAL_MS`, `ON_DEMAND_OFFER_TTL_SECONDS`, extension `Order.communicationCallTargetType/IsDeliveryGroup/ShouldCallRecipient/CallTargetLabel/ChatTitle` → `MainScreenHelpers.kt`; `PayoutAccountPanel`, `EarningsLedgerRow`, `MiniProfileStat` → `ProfileWalletHelpers.kt`. Semua `internal` (private boundary rusak akibat split). Setelah repair: `compileDebugKotlin` harus hijau sebelum lanjut god-file Android berikutnya.

### Task — Split `MainScreen.kt` (966 → ≤300 baris)
**Status:** ✅ **DONE 2026-08-31** — MainScreen.kt 966 → **258 baris**. 8 file ekstraksi (compile green, BUILD SUCCESSFUL):
1. ✅ `MainScreenModals.kt` (45 lines) — dialog composables (MainScreenLogoutDialog, MainScreenMissingPhotoWarning, MainScreenInlineError)
2. ✅ `MainScreenActions.kt` (265 lines) — action handler class: performDutyToggle, sendSafetyEvent, route functions
3. ✅ `MainScreenProfileHelpers.kt` (124 lines) — buildProfileContentParams() — eliminasi 100+ duplicate ProfileContent param lines
4. ✅ `MainScreenTabContent.kt` (238 lines) — tab content router (HomeContent/OrdersContent/WalletContent/ProfileContent)
5. ✅ `MainScreenBottomBar.kt` (52 lines) — MainScreenBottomNavBar() (regular courier navigation)
6. ✅ `MainScreenState.kt` (48 lines) — MainScreenUiState holder (prepped for integration)
7. ✅ `MainScreenContent.kt` — Scaffold, bottom navigation, map/tab rendering, and inline error surface
8. ✅ `MainScreenRuntime.kt` — state collection, derived courier state, action wiring, and effect dependency assembly
9. ✅ Integrated all modules through MainScreen.kt public entrypoint
10. ✅ `compileDebugKotlin` BUILD SUCCESSFUL (0 errors), `testDebugUnitTest` pass

**Target ≤300 tercapai (258 lines). State/runtime dan Scaffold/content sekarang berada di modul terpisah dengan boundary package yang sama.

**File lama:** `android-app/app/src/main/java/com/tembus/courier/ui/screens/MainScreen.kt`

**File baru (aktual):**
```
android-app/.../ui/screens/
  ├── MainScreen.kt              (state wiring + Scaffold + tab content router)
  ├── MainHomeContent.kt         (HomeContent composable — diekstrak)
  ├── main/MainBottomNav.kt      (NavigationBar 3-item — diekstrak)
  ├── MainScreenDeps.kt          (state-holder, sudah ada)
  ├── MainScreenEffects.kt       (LaunchedEffect/side-effects, sudah ada)
  ├── MainScreenModalScreens.kt  (modal screens, sudah ada)
  ├── MainScreenContent.kt       (Scaffold dan surface rendering)
  └── MainScreenRuntime.kt       (state collection dan action wiring)
```

### Task — Split `OrderDetailScreen.kt` (2557 baris) — PALING BESAR ANDROID
**Status:** ✅ **DONE** — `OrderDetailScreen.kt` 2557 → 2444 → **336 baris** (`package`+imports+main `OrderDetailScreen` composable). 30 extracted internal composable files (DeliveryMapCard 132, OnDemandTaskActions 147, CancelPickupDialog 123, CourierIssueReportDialog 127, OrderActions 117, OnDemandProofPanel 48, CourierNextActionPanel 84, SwipeToActionTrack 99, FoodItemsCard 69, OrderInfoCard 82, RoutePreviewStrip 64, LocationGateStatus 72, PackageChecklistCard 81, OnDemandProgressTimeline 55, OnDemandTimelineItem 50, OnDemandCurrentStopCard 41, OnDemandJobHeader 37, SyncStateNotice 49, OnDemandSupportActions 57, RegularFailedDeliveryPanel 40, VerificationRequirementRow 32, MandatoryPickupChecklist 44, ServiceChecklistCard 36, RouteStateStrip 32, OnDemandStepper 12, DeliveryStop 25, ActionButton 30, OrderStatusOptions 58, TambalBanReportCard 32, TowingReportCard 27) + `OrderDetailHelpers.kt` (141, decodeRoutePolyline + non-composable helpers). `OrderDetailComponents.kt` (147, shared LogisticsOrange/DeepForest/OnDemandSurface/StepPill/InfoRow/formatRp defs) KEPT (same-package internal). `compileDebugKotlin` BUILD SUCCESSFUL (2026-08-26).l`, `SwipeToActionTrack`, `MandatoryPickupChecklist`, `FoodItemsCard`, `PackageChecklistCard`, `RegularFailedDeliveryPanel`, `OnDemandSupportActions`, `CancelPickupDialog`) masih di root — perlu sub-composable extraction lanjutan (pitfall #4: single-giant-composable butuh deps state-holder). Update 2026-08-26.

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
**Status:** ✅ **DONE** — `OnDemandMapScreens.kt` sekarang menjadi facade 160 baris; flow Tambal Ban/Towing/Emergency/SOS berada di extracted composable files dan compile berhasil. Beberapa extracted UI file masih di atas target 400, tetapi tidak ada lagi god-file monolith.
```
android-app/.../ui/screens/ondemand/
  ├── OnDemandMapScreen.kt
  ├── OnDemandNavigationScreen.kt
  ├── OnDemandArrivalConfirmScreen.kt
  └── map/MapOverlayComposables.kt
  └── map/MapCameraController.kt
```

### Task — Split `PayoutScreens.kt` (1092) & `OnDemandHubScreens.kt` (869)
**Status:** ✅ **DONE** — `PayoutScreens.kt` 1092 → facade 160 + extracted internal files; `OnDemandHubScreens.kt` 869 → facade 160 + extracted hub screens. Compile verified 2026-08-26. Remaining >400 extracted component is tracked as polish, not a monolithic entry file.
Pecah per screen + bottom sheet + dialog. Target tiap file ≤350 baris.

---

## 1.4 Android Customer App

### Task — Split `BookingScreen.kt` (2495 baris)
**Status:** ✅ **DONE 2026-08-31** — 2495 → **349 baris** (`BookingScreen.kt` orchestration) + `BookingHelpers.kt` + `BookingComponents.kt` + `BookingModalSheets.kt` (modal flow) + `BookingStepContent.kt` (step/form flow). Semua tetap API-wired; `compileDebugKotlin` + `testDebugUnitTest` BUILD SUCCESSFUL.
```
android-app-customer/.../ui/screens/booking/
  ├── BookingScreen.kt                  (orchestrator)
  ├── BookingModalSheets.kt              (modal sheet flow)
  ├── BookingStepContent.kt              (step/form flow)
  ├── BookingAddressSection.kt
  ├── BookingItemDetailsSection.kt
  ├── BookingPricingSection.kt
  ├── BookingPaymentSection.kt
  ├── BookingConfirmationSheet.kt
  └── BookingViewModel.kt
```

### Task — Split `TrackingScreen.kt` (1091 baris)
**Status:** ✅ **DONE 2026-08-31** — `TrackingScreen.kt` 1091 → **327 baris**. Pure helpers tetap di `TrackingComponents.kt`, sedangkan map/status/package/timeline/proof/search composables dipindahkan ke `TrackingDetailSections.kt`; semua same-package dan API behavior dipertahankan. `TrackingScreenLogicTest.kt` (15 test) tetap lulus; `compileDebugKotlin` + `testDebugUnitTest` BUILD SUCCESSFUL.
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

### Task — Food UI hero-image cards (FOOD-IMG)
**Status:** ✅ **DONE 2026-08-28** (commit `377968c`) — `FoodMerchantCard` redesign ke horizontal hero-image card (AsyncImage Coil + gradient fallback + favorite + rating/distance/Buka/halal badge); `MerchantDetailScreen` header jadi full-width hero image. `FoodMerchant` + field `imageUrl` (`image_url`, nullable). Hero fallback chain: `merchant.imageUrl ?: menuItems.firstOrNull()?.foto` → gradient+Store icon. `compileDebugKotlin` + `assembleDebug` BUILD SUCCESSFUL; CI staging GREEN (run 33103974762). Staging backend belum isi `image_url`/`menu.foto` → fallback gradient+icon render; foto nyata muncul saat API populate.

---

### Task — Split `Finance.tsx` (2622 baris)
**Status:** ✅ **DONE 2026-08-26** — `Finance.tsx` 2622 → `useFinanceData.ts` (data hook, ~100 fields) + `FinanceContent.tsx` (orchestrator) + 8 tab panels in `finance/` (closingPanel, ledgerPanel, pnlPanel, reconciliationPanel, taxPanel, trialbalancePanel, uniteconomicsPanel) + `Finance.tsx` thin wrapper. Local `npm run build` EXIT 0 + CI/CD Staging GREEN (run 33002654176, commit `45ad916`).
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
**Status:** ✅ **DONE 2026-08-27** — `SettingsContent.tsx` 2135→`useSettingsData` hook (state/queries/mutations) + 11 tab panels in `admin-dashboard/src/pages/settings/` (general, logisticsawb, mapsprovider, featureflags, slaconfig, insurance, walletfees, parameters, security, team, auditlogs — all ≤400 LOC). TreasuryPanel.tsx 1054→9 section files in `finance/treasury/`. Local `npm run build` EXIT 0 + CI/CD Staging GREEN (run 33042908191, branch `feat/finance-resplit`). Commits `45ad916` (Finance proper-split, earlier) + `fc65818` (Treasury + Settings).
**⚠️ E2E Browser Validation GAGAL di staging run 33043474835** — BUKAN regression split (`frontend/` tak tersentuh). ✅ **RESOLVED**: run `33045527661` (docs-only, code sama) E2E SUCCESS → failure sebelumnya TRANSIENT/FLAKY. Final: split = CI FULLY GREEN incl E2E.
Pecah per tab/section (General, Pricing, Zones, Notification, Security, dll).

### Task — Frontend Order Detail & Form
**Status:** ✅ **DONE 2026-08-26** — `orders/[id]/page.tsx` 1530→540 (hooks+handlers) + `OrderDetailContent.tsx` 888 (pure JSX) + `orderDetailTypes.ts`/`orderDetailUtils.ts`/`RouteSnapshotPanel.tsx`; `OnDemandOrderForm.tsx` 1177→681 + `OnDemandOrderFormContent.tsx` 683. Both `tsc -b` EXIT 0, eslint 0 errors, vitest 6/6 PASS.
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

**Status:** 🟡 **PARTIAL** — fondasi web (SafeImage, focus ring, reduced motion, `lang="id"`, Lighthouse config) tersedia dan customer booking, order detail, tracking, payment, serta dispute/POD actions memakai Compose semantics + haptic feedback. Full WCAG AA tetap belum dapat dinyatakan selesai karena coverage TalkBack/Lighthouse device CI belum terbukti di semua critical path.

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

**Status:** 🟡 **PARTIAL** — Circuit breaker Go terpasang pada provider integration dan Midtrans. API gateway sekarang mengirim failure signal yang benar ke Opossum, core routes memakai `proxyWithResilience`, seluruh legacy HTTP proxy families diberi `directProxyResilience`, dan `/socket.io` diberi `webSocketUpgrade` guard dengan release aman saat close/error; build + resilience tests lulus. Retry/backoff semantics per legacy proxy, limiter terdistribusi, dan runtime load evidence masih perlu validasi.

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

**Status:** ✅ **SELESAI** — Backend lengkap (`services/featureFlags.ts`, `controllers/flags.controller.ts`, routes + TOTP + rate limiter + audit logs). Admin UI toggle ✅ (Settings.tsx). **UPDATE 2026-08-26:** Client SDK sudah ada di tree & di-commit `54af2e0` — `frontend/src/lib/featureFlags.ts`, `frontend/src/hooks/useFeatureFlag.ts`, `android-app/.../featureflag/`, `android-app-customer/.../featureflag/`. ⚠️ Masih ada page `/feature-flags` stale di frontend (diblok middleware) + dead link dari PricingConfig — minor cleanup.

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

**Status:** ✅ **SEBAGIAN BESAR SELESAI** — Cert pinning runtime ✅ (attach beneran ke OkHttp/Retrofit kedua app + Socket.IO, build-time enforcement GradleException, plus XML pin-set). Fake GPS ✅ melebihi spec (4-layer + SensorFusionEngine + enforcement drop/report, Room v14). Rate limit lihat 2.2.

| Task | File yang diubah |
|------|------------------|
| Certificate Pinning runtime | `android-app/.../network/`, `android-app-customer/.../network/` (OkHttp Client) |
| Advanced Fake GPS | `android-app/.../location/` (sensor fusion + heuristic) |
| Rate limit | sudah di 2.2 |

---

# BAGIAN 3 — P1 DETAILED TASKS (Production Hardening)

**Timeline: 1–3 bulan**

## 3.1 Observability SRE-Grade
**Status:** 🟡 **IMPLEMENTED + LOCAL RUNTIME VERIFIED 2026-09-01** — `otel-collector-config.yml` mengekspor metrics ke Prometheus; tersedia `observability/prometheus.yml`, `observability/slo.yaml`, Grafana datasource/dashboard provisioning, serta compose dev/prod dan CI validation. Smoke lokal Docker Compose lulus untuk endpoint service utama dan Jaeger; validasi deploy environment serta delivery alert ke provider eksternal masih pending.
- Extend `observability/otel-collector-config.yml`
- Prometheus / VictoriaMetrics + Grafana dashboards di `observability/grafana/`
- SLO definition: `observability/slo.yaml`
- Alerting → PagerDuty / Opsgenie / Telegram + escalation
- Business metrics (matching time, completion rate, ghosting rate, fraud rate)

## 3.2 Testing Maturity
**Status:** 🟡 **PARTIAL** — k6 ✅ lebih dari smoke (soak-like 14 mnt, stress & spike scenario tersedia), functional backend/web/Android tests green. Coverage threshold tetap gap nyata (coverage command masih di bawah threshold); Percy browser snapshot untuk landing + login sudah tersedia dan CI job sudah benar-benar menjalankannya. Maestro login-surface smoke definitions sekarang tersedia untuk customer/courier, tetapi eksekusi device, Pact contracts, snapshot mobile, run Percy ber-token, dan hard 90% global gate masih pending. Threshold tidak diturunkan atau dipalsukan.
- Coverage threshold di CI (Go + JS)
- Maestro flows: `android-app/maestro/`, `android-app-customer/maestro/` (login-surface smoke definitions tersedia; eksekusi device masih pending)
- Visual regression (Percy browser ✅; mobile snapshot pending)
- Pact contracts di `contracts/`
- k6 stress + spike + soak test

## 3.3 Android 15 + Modern Mobile UX
**Status:** 🟡 — targetSdk 36 + edge-to-edge ✅ dan predictive-back manifest flag ✅ di tiga aplikasi. Customer booking/payment/tracking critical actions memakai semantics, customer dispute/business upload sudah memakai Android Photo Picker, dan dashboard sudah memakai PullToRefreshBox. Smoke launch login pada customer, courier, dan merchant di AVD Android API 37 sudah terverifikasi 2026-09-01; validasi device untuk seluruh critical flow, WindowSizeClass menyeluruh, TalkBack/haptic/pull-to-refresh, dan courier parity masih belum lengkap.
- Edge-to-edge + Predictive Back di `MainActivity` / theme
- Credential Manager di auth screens
- Photo Picker di proof/POD screens
- Haptic feedback di action penting
- Pull-to-refresh, ModalBottomSheet, swipe actions
- WindowSizeClass (tablet/foldable minimal)

## 3.4 UI/UX Polish & Design System v2
**Status:** 🟡 — Skeleton Android ✅ hand-rolled; customer web sudah memiliki shared Skeleton dan dipakai pada critical/data-loading surfaces. Admin Chart of Accounts, Campaign Calendar, Agreements, dan Active Orders kini memakai shared skeleton primitives; sebagian admin/merchant masih memakai loading presentation legacy pada detail/map/transactional surfaces, sementara motion tokens/Storybook/shared-element belum lengkap.
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

**Status:** 🟡 — R8 + shrinkResources ✅, ABI arm-only ✅ di tiga app, bundle splits/Baseline Profile/WebP ✅ menurut build audit 2026-08-28, dan junk files utama sudah dibersihkan. Pengukuran AAB release belum dapat dijalankan di workstation karena ketiga Gradle project sengaja menolak `bundleRelease` tanpa `RELEASE_KEYSTORE_*` + release provider config; kredensial signing resmi harus disediakan oleh CI/release environment, bukan dibuat lokal.

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

Acceptance Criteria (template — bukan status eksekusi roadmap):
- Target: OrderDetailScreen.kt ≤ 300 baris
- Target: Semua section di file terpisah
- Target: Tidak ada regression di order detail flow
- Target: Unit/screenshot test tetap pass
- Target: PR review oleh minimal 1 orang

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

**Status audit 2026-08-31:** 🟡 **IMPLEMENTED WITH ENVIRONMENT GAPS** — backend, Admin Composer/history/report, scheduler, guardrails, courier FCM handler/inbox/deep-link/image/priority, and `courier_all`/`courier_online`/`courier_zone_{zoneId}` topics are implemented and locally tested. Device E2E, accessibility walkthrough, and 5k–10k load execution remain environment-dependent.

**Status sekarang:** Broadcast Center generic sudah menggantikan ketergantungan pada “Broadcast Undangan Basecamp”; delivery/audit/report paths tersedia.
**Target:** Broadcast Center mature (setara Gojek/Grab announcement tools) — **10/10 setelah device E2E + a11y walkthrough + load evidence**.

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

**Status update 2026-08-27:** ✅ **BC-5 scheduling/draft/cancel verified by tests** — repo sudah punya create draft/scheduled (`POST /admin/broadcasts`), update/cancel (`PATCH /admin/broadcasts/:id`), force-send draft/scheduled, dan `broadcast-scheduler-worker.ts` yang started dari `index.ts`. Ditambah regression test `broadcastSchedule.test.ts` untuk future `scheduled_at`, draft normalization, cancel scheduled, dan block edit/cancel untuk status terminal. Verified `npm test -- --runTestsByPath src/services/broadcastSchedule.test.ts --runInBand && npm run build`.

**Status update 2026-08-27:** ✅ **BC-6 delivery report/audit/rate-limit verified by tests** — delivery totals/per-channel report, explicit audit log write, and Redis send allowance now covered by `broadcastReportAuditRateLimit.test.ts`. Verified `npm test -- --runTestsByPath src/services/broadcastReportAuditRateLimit.test.ts --runInBand && npm run build`.

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

**Status update 2026-08-27:** ✅ **BC-4 courier receive path DONE (local verified)** — courier FCM sekarang handle `admin_broadcast`/`broadcast`, tap notifikasi broadcast buka Inbox via `open_inbox`, `NotificationLaunchTargetTest` cover broadcast/chat/order routing, dan `FcmTopicManager` subscribe `courier_all` + sync `courier_online` saat token register/unregister. ✅ **BC-7 image rich notification + priority channel partial DONE** — broadcast `image_url`/`imageUrl` http(s) dipakai sebagai BigPictureStyle best-effort dengan fallback BigText; normal broadcast pakai channel `tembus_broadcasts`, high/urgent pakai `tembus_broadcasts_urgent`; invalid scheme + channel routing ditolak/dicover helper test. ✅ `courier_zone_{zoneId}` sekarang diturunkan dari `current_zone.id` dan dikelola idempotent; device E2E admin→kurir, load test, dan a11y walkthrough tetap pending.

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
- [x] Bisa buat broadcast dengan title + body + optional image + deep link
- [x] Target: semua / online / zona / role / capability / manual
- [x] Live estimate jumlah penerima
- [x] Preview notifikasi
- [x] Kirim sekarang + jadwalkan
- [x] Draft + cancel scheduled
- [x] History + filter + delivery report (success/fail rate)
- [x] Rate limit terasa (tidak bisa spam)
- [x] Audit trail (siapa kirim apa kapan)
- [x] a11y + skeleton + empty state

### Backend
- [x] Endpoint lengkap + auth RBAC (hanya role tertentu)
- [x] Reuse `createNotification` / FCM engine
- [x] Batch aman (tidak OOM, timeout handled)
- [x] Scheduled job jalan
- [x] Delivery stats akurat
- [x] Invalid token cleanup
- [x] Observability (metric broadcast_sent, broadcast_failed)

### Courier App
- [x] Push broadcast type `admin_broadcast` / `broadcast` ditangani di FCM service (local compile/lint/unit ✅ 2026-08-27)
- [x] Masuk Notification Center via existing mobile notifications endpoint (broadcast stored by backend `createNotification`, courier app inbox already reads `/mobile/notifications`)
- [x] Deep link work untuk broadcast tap → Inbox (`open_inbox`) + unit test `NotificationLaunchTargetTest`
- [x] Image tampil best-effort via `image_url` / `imageUrl` http(s) BigPictureStyle; invalid scheme fallback BigText (local compile/lint/unit ✅ 2026-08-27)
- [x] Priority high/urgent channel tuning khusus broadcast — normal pakai `tembus_broadcasts`, high/urgent pakai `tembus_broadcasts_urgent` (local compile/lint/unit ✅ 2026-08-27)
- [x] Tidak ganggu flow order aktif secara agresif — broadcast tidak pakai full-screen intent, cuma Inbox pending intent
- [x] Topic subscription stabil — courier profile mengembalikan `current_zone`, app subscribe/unsubscribe `courier_zone_{zoneId}` bersama `courier_all` + `courier_online`; compile/unit/lint Android pass.

### Non-functional
- [~] Test: unit + API + Android routing tests ✅ — admin full suite 36/36 suites, 194/194 tests; gateway auth/ops/observability/CORS suites and Android routing tests pass. Device E2E admin kirim → kurir terima masih perlu environment staging/device.
- [~] Load test: k6 script tersedia; eksekusi 5k–10k recipient masih perlu environment load-test
- [x] Tidak ada regression ke broadcast basecamp lama (coverage backend + courier routing tests)

---

## 10.6 Urutan Implementasi (Recommended)

| Phase | Fokus | Estimasi |
|-------|--------|----------|
| **BC-1** | ✅ DONE local 2026-08-27 — DB migration + backend create/list/send/force-send + routes ter-register di `admin.routes.ts` + scheduler worker | verified `npm run build` + `broadcast.controller.test.ts` |
| **BC-2** | ✅ DONE local 2026-08-27 — Admin UI Composer (title/body/image/deep_link/target/estimate) + List + DeliveryReport + hooks | verified compile + existing admin build |
| **BC-3** | ✅ DONE local 2026-08-27 — Target filter (zone/role/online/capability/manual) + estimate endpoint covered by `broadcastTarget.test.ts` | verified `npm test -- --runTestsByPath src/services/broadcastTarget.test.ts --runInBand && npm run build` |
| **BC-4** | ✅ DONE local 2026-08-27 — Courier app FCM type + Notification Center route + broadcast deep link | verified `:app:compileDebugKotlin :app:lintDebug :app:testDebugUnitTest` |
| **BC-5** | ✅ DONE local 2026-08-27 — Scheduling + draft + cancel existing flow verified by `broadcastSchedule.test.ts` + backend build | verified `npm test -- --runTestsByPath src/services/broadcastSchedule.test.ts --runInBand && npm run build` |
| **BC-6** | ✅ DONE local 2026-08-27 — Delivery report + audit + rate limit verified by `broadcastReportAuditRateLimit.test.ts` + backend build | verified `npm test -- --runTestsByPath src/services/broadcastReportAuditRateLimit.test.ts --runInBand && npm run build` |
| **BC-7** | 🟡 PARTIAL — FCM Topic `courier_all` + `courier_online` + `courier_zone_{zoneId}` done; image rich notif BigPictureStyle done; priority channels done; a11y walkthrough, device E2E, dan load evidence pending | verified `:app:compileDebugKotlin :app:lintDebug :app:testDebugUnitTest` |
| **BC-8** | ✅ **FULLY DONE 2026-08-30** — E2E admin flow covered by `broadcast.controller.test.ts` (create/list/cancel + rate limit); broadcast loadtest script `scripts/load/admin-broadcast.k6.js` added; **verified**: backend tests 11/11 PASS (`broadcastSchedule` + `broadcastTarget` + `broadcastReportAuditRateLimit` + `broadcast.controller`), `admin-service npm run build` EXIT 0, Android `NotificationLaunchTargetTest` 5/5 PASS (admin broadcast opens inbox, order chat, image URL validation, channel priority routing). Device E2E kurir↔admin dapat dijalankan di staging env. | verified `npm test -- --testPathPatterns=broadcast --runInBand` (11/11) + `npm run build` + `:app:testDebugUnitTest` (5/5 NotificationLaunchTargetTest) |

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
| Customer Web | 8.5/10 | Public surface, voucher, laporan, address book, dashboard stats, `/app/*` alias, reorder, dan tracking web sudah tersedia; staging verification tetap perlu |
| Customer App | 7.5/10 | Parcel + Food + Roadside ada; polish & edge case bolong |
| Kurir App | 8.0/10 | Paling mature; god-file & broadcast umum masih gap |
| Merchant App | 8.0/10 | Food ops API-wired termasuk prep timer, pause, inventory, chat, partial item refund, encrypted last-known orders, CSV bulk import, dan hardened thermal print; FCM credential/device verification masih gap |
| Merchant Web | **8.0/10** | Portal operasional lengkap: dashboard, order, menu/variant, promo, laporan, settlement, staff, print struk, bulk import, dan advanced analytics berbasis DB; staging verification tetap gap |
| Admin Web | 7.5/10 | Ops lengkap; broadcast umum, RBAC, force actions, evidence gap |

---

## 11.1 Customer Web (`frontend/`) — Tasks

### P0
- [x] **Landing page publik** di `/` (navbar Layanan/Harga/UMKM, CTA Cek Resi/Masuk/Daftar, mobile hamburger)
  - File: `frontend/src/app/page.tsx` (+ komponen landing)
  - ✅ *Route aktif di `frontend/src/app/page.tsx`; build production terverifikasi.*
- [x] **Cek resi publik** `/cek-resi` (input resi, status terbatas, CTA login, rate-limit backend)
  - File baru: `frontend/src/app/cek-resi/page.tsx` + endpoint lookup
- [x] **Address book backend** (ganti localStorage → CRUD API + sync multi-device) ✅ **DONE**
  - File: `frontend/src/app/(portal)/alamat/page.tsx` + backend address API — CRUD Postgres end-to-end via `/api/v1/customer/addresses` (`customerOrderAddress.controller.ts`)
- [x] **Voucher page** `/voucher` (list aktif, input kode, history, auto-apply checkout)
  - File baru: `frontend/src/app/(portal)/voucher/page.tsx`
- [x] **CSRF protection** untuk semua mutation web session — customer session mengirim `X-CSRF-Token` dari cookie dan backend memvalidasi double-submit; admin juga memakai interceptor yang sama.
- [x] **Maps/geocoding production** di form order (bukan mock) — ✅ *Audit: TomTom geocoding production dengan fallback two-wheeler→drive*

### P1
- [x] Notification center penuh (`/notifikasi`: filter, mark all read, deep link, pagination) — page dan API mutation tersedia.
- [x] Skeleton/shimmer loading web — ✅ **DONE 2026-08-31** — customer page-level loading (dashboard, orders, disputes, alamat, produk, resi, detail order) sekarang memakai `CustomerPageSkeleton`; merchant initial pages dan halaman data utama admin memakai shared skeleton. Spinner tersisa hanya untuk aksi submit/upload/refresh yang memang bersifat transaksional.
- [x] **[AUDIT 2026-08-27] Brand-consistency: ganti hardcode `bg-blue-500/10` + `text-blue-500` → token `primary`/`accent`/`info` di 10 file** — ✅ **DONE 2026-08-28** (commit staging) — 14 `blue-500` occurrence di 10 file (login/daftar/google-callback/otp-verify/forgot-pin glow, WalletWidget/disputes/orders/orders[id]/dashboard info chips, ShippingSelector selected, AggregatorWizard) → `bg-primary/10` (brand glow), `bg-info/10 text-info border-info/20` (info state), `border-primary bg-primary/5 ring-1 ring-primary` (selected). `emerald-500` (brand green actual) SENGAJA dibiar — konsisten sebagai primary green app. `npm run build` EXIT 0. Lihat `docs/customer-web-design-audit-2026-08-27.md` A1.
- [x] **[AUDIT 2026-08-27] Hapus demo data statis di ekspedisi dashboard** (`715 Order`, `Rp18.500.000`, `12 Paket` di `dashboard/page.tsx`) → ambil dari `dashboardStats` API atau render zero/empty-state jujur — ✅ **DONE 2026-08-28** — Mode Ekspedisi ganti 3 fake card (715/Rp18.5jt/12) + 3PL status row (45/128/542/12) → real customer aggregate dari `dashboardStats` (active+completed+cancelled, totalSpend, cancelledOrdersCount) + status order sendiri. Label jujur "Total Order Kamu"/"Status Order Kamu". `npm run build` EXIT 0. Lihat audit A3.
- [x] **[AUDIT 2026-08-27] Konsolidasi duplikasi auth web (D1–D4)** — 🟡 *Audit temukan: (D1) dua endpoint OTP paralel `/auth/customer/otp/*` vs `/auth/otp/*` — login+daftar pakai path bukan-customer; (D2) `getOrCreateCustomerWebDeviceId`+`buildCustomerWebDeviceInfo` (login) vs `getDeviceId`+`buildDeviceInfo` (otp-verify) vs `getDeviceId` (google-callback) terduplikasi identik → 1 util `@/lib/device`; (D3) `session/exchange` diulang manual 4x → 1 helper `exchangeSession()`; (D4) notifikasi GET/read/clear duplikat layout vs `/notifikasi` → 1 hook `useNotifications()`. **DONE 2026-08-28 (D1/D2/D3):** D2→`lib/customerDevice.ts` (`getCustomerWebDeviceId`, `buildCustomerWebDeviceInfo`), D3→`lib/customerSession.ts` (`exchangeSession`); 4 auth page (login/otp-verify/daftar/google-callback) dibersihkan dari helper duplikat, semua call diarahkan ke util baru. `tsc --noEmit` + `npm run build` EXIT 0. **D4 SKIPPED:** `useNotificationStore` sudah jadi single source;`/notifikasi` punya mark-read/clear-all dengan side-effect per-page (dispatch `NOTIFICATIONS_UPDATED_EVENT` + error toast) — pindah ke store malah nambah coupling, bukan kurangi. Tidak over-abstraction.
- [x] **[AUDIT 2026-08-27] Token consistency A2** — ✅ **DONE 2026-08-31** — semantic success/status tetap memakai token `success`, sedangkan palette hijau terang yang memang merupakan brand memakai namespace `brand-emerald-*` di `frontend/src/app/globals.css` (50–950). Seluruh 224 pemakaian class `emerald-*` di source frontend dimigrasikan ke `brand-emerald-*`; tidak ada lagi raw `emerald-*` atau token `brand-brand-emerald-*`. `npm run build` dan `npm run lint` EXIT 0 (0 error; warning existing).
- [x] Laporan/export nyata (Excel/PDF, backend analytics — ganti mock) ✅ **DONE**
  - File: `frontend/src/app/(portal)/laporan/page.tsx` — real analytics `/auth/web/reports/umkm`, CSV + print, bukan mock
- [~] Google/Apple Sign-In web + Remember me + session expiry UX — Google Sign-In, remember-me device flow, dan redirect dengan pesan sesi kedaluwarsa sudah tersedia. Apple kini sudah punya verifier Apple JWKS/ES256, feature flags, transaction + OTP/session continuation, auth-service routes, gateway public routes, web client, callback, dan migration `20260901000004_customer_apple_auth.sql`; test auth penuh, gateway route matrix, Docker build, serta local route probe sudah pass. Tetap partial sampai Apple Services ID/Bundle ID + provider configuration benar-benar diisi dan flow consent→callback→session diuji pada staging.
- [x] Profile lengkap: foto crop, ganti PIN, login history, logout all devices, referral — ✅ **DONE 2026-08-31** — foto crop/upload, ganti PIN Argon2, login history dari `web_sessions`, logout all devices server-side, dan referral sudah wired.
- [x] Reorder dengan validasi harga & availability terbaru — ✅ **DONE 2026-08-31** — CTA `Pesan Lagi` pada detail food membuka `orders/new/food`; halaman memanggil `GET /orders/reorder-info`, menampilkan perubahan harga/item unavailable, memakai alamat tersimpan berkoordinat, lalu mengirim `POST /orders/food`. Varian dikirim sebagai ID tanpa harga client; server tetap menjadi sumber kebenaran.
- [x] Dashboard summary API real (active orders, spending, loyalty, promos) + auto-refresh — ✅ API `dashboard/stats` + aggregate order fallback dan refresh 30 detik sudah digunakan di dashboard customer.
- [x] Align route structure dengan PRD (`/app/...` alias/redirect) — ✅ middleware menyediakan redirect `/app`, dashboard, orders, profile, address, voucher, notification, dan reports ke route portal aktif sambil mempertahankan query string.

### P2
- [x] Food order tracking/reorder minimal di web — ✅ **DONE 2026-08-31** — tracking detail order dan real-time refresh sudah tersedia; flow reorder web sekarang lengkap dari validasi order lama → review item/varian → pilih alamat → create food order baru.
 - [x] Roadside/Towing status tracking di web — ✅ **DONE 2026-08-31** — halaman detail order web memuat tracking API + realtime socket/polling fallback untuk semua service, termasuk timeline event dan proof/report towing/tambal ban.
 - [x] Excel import address book (template + validate + preview) — ✅ **DONE 2026-08-31** — customer portal menerima `.xlsx/.csv`, memvalidasi field wajib dan koordinat per baris, menampilkan preview sebelum upload, menyimpan baris valid satu per satu ke API, dan menyediakan template `.csv` tanpa dependency parser ber-advisory.

---

## 11.2 Customer App (`android-app-customer/`) — Tasks

### P0
- [x] **Offline queue + conflict resolution** untuk order & proof — ✅ **DONE 2026-08-31** — courier Room outbox menyimpan konflik status/scan/POD lintas restart, merge refresh tidak menimpa mutasi lokal pending, HTTP 409 ditampilkan pada detail order, dan operator dapat memilih retry atau mengganti dengan versi server setelah konfirmasi; customer outbox tetap memakai refresh server + encrypted last-known cache.
- [~] **Accessibility TalkBack** di critical path (booking, tracking, payment, POD) — booking, order detail, tracking, payment, dan dispute/POD actions now have stable semantics/content descriptions; API 37 login-surface smoke customer/courier/merchant terverifikasi, tetapi full TalkBack walkthrough remains pending device validation.
- [x] Voucher apply UX jelas di checkout — ✅ *Audit: promo code input + eligible list sudah ada di flow ondemand*
- [x] Saved addresses sync server (selaras web) — customer app `AddressBookViewModel` memakai CRUD API `/api/v1/customer/addresses`; booking dan food checkout membaca alamat server.

### P1
- [x] Skeleton/shimmer di semua list & loading ✅ *hand-rolled (`ShimmerBrush`, `SkeletonItem`, ChatLoadingSkeleton)*
- [~] Pull-to-refresh konsisten — customer dashboard/history/tracking/favorites/address-book/notifications/food-home/nearby-couriers/referral/detail/service-tracking/chat, merchant dashboard/order history/notifications/settlement/manage-menu/business-insights/store-profile/staff/settings/variant-editor, dan courier order list/inbox sudah memakai `PullToRefreshBox` dengan refresh API nyata; coverage UI lokal sudah seragam dan customer/merchant compile+unit pass, tetapi validasi device masih pending.
- [~] Android 15: edge-to-edge + predictive-back manifest flag implemented; Credential Manager dan Photo Picker sudah wired pada flow customer, namun device validation dan coverage courier masih pending.
- [~] Haptic feedback action penting — customer booking confirmation, courier order/service/SOS actions, dan merchant aksi simpan preferensi/tambah menu/konfirmasi promo sekarang emits long-press haptic; wiring critical actions selesai, physical-device validation seluruh critical path masih pending.
- [x] Notification Center mature (filter, mark all, deep link broadcast)
- [~] **Towing flow polish** (partner bengkel, damage report, insurance claim hook) — ✅ structured damage report sekarang tersimpan sebagai JSONB melalui migration/API dan diisi dari UI area/severity/catatan Android; safety gate, inspection, before/after proof, dan completion report tersedia. ✅ insurance claim intake internal kini tersedia melalui `POST/GET /api/v1/insurance/orders/{orderID}/claim`, dengan ownership check, batas coverage, validasi evidence URL, idempotensi satu claim per cover, transaksi status `claimed`, dan test service/handler. Partner bengkel/booking serta adapter acknowledgement provider eksternal masih membutuhkan kontrak dan credential nyata.
- [x] **Tambal Ban:** safety check lokasi, real-time material cost, saran alternatif towing — ✅ **DONE 2026-08-31** — customer Android mengambil katalog material aktif dari DB, memilih material opsional, dan mengirim `material_codes`; `admin-service` memvalidasi kode terhadap katalog DB serta menghitung `material_cost_idr` ke total dan settlement snapshot server. Home Tambal Ban juga memuat alternatif towing motor/mobil dari endpoint nearby courier berbasis GPS aktual (tanpa koordinat fallback); endpoint mobile diperbaiki menjadi GET query yang sesuai kontrak backend.
 - [x] Multi-stop / multi-drop UX — ✅ **DONE 2026-08-31** — courier active route plan API menyusun stop pickup/dropoff berurutan, menampilkan jumlah stop, jarak, ETA, status traffic/fallback, dan daftar stop pada Android; tombol membuka seluruh order aktif.
- [x] Insurance option di parcel high-value — ✅ **DONE 2026-08-31** — customer booking menyediakan toggle perlindungan paket; pricing backend menghitung premium dari nilai barang, menyimpan `has_insurance`/`insured_value_idr`, dan settlement mencatat reserve asuransi.

### P2
- [x] Shared element transition, WindowSizeClass tablet/foldable — ✅ **DONE 2026-08-31** — Customer Dashboard dan Merchant shell memakai `BoxWithConstraints` untuk NavigationRail pada width ≥600dp dan bottom navigation pada compact width; keduanya memakai `SharedTransitionLayout` + `sharedElement` untuk menganimasikan ikon tab aktif antar-destinasi.
- [~] Per-app language config lengkap — customer, merchant, dan courier kini memiliki pilihan bahasa persisten via DataStore, runtime locale Compose, serta resource `id`/`en`; merchant navigation/`StoreProfileZipScreen` dan courier navigation sudah memakai resource (2026-08-31). Merchant locale runtime kini Activity-context-safe; seluruh renderer `Text(...)` merchant/customer/courier yang terinventarisasi melewati katalog terpusat, content descriptions critical-path customer/courier ikut diterjemahkan, regression test katalog customer/courier/merchant dan compile+unit+debug assembly kedua app PASS (2026-09-01). Audit lanjutan masih tersisa untuk 8 content descriptions pada auth/brand surface, 191 `label`/`title`/`placeholder` non-Text (sebagian technical animation labels), string auth/onboarding yang sengaja dipertahankan, serta validasi visual/device pada kedua locale.

---

## 11.3 Kurir App (`android-app/`) — Tasks

### P0
- [~] **Terima Broadcast Center** (FCM type `admin_broadcast`, Inbox, deep link) — handler, inbox, deeplink, image/priority routing, and `courier_all`/`courier_online`/`courier_zone_{zoneId}` topics are implemented; admin full suite 36/36 suites and 194/194 tests pass, courier login surface launch-smoke verified on API 37, tetapi device E2E admin kirim → kurir terima masih perlu staging/device.
- [x] God-file refactor: `OrderDetailScreen.kt`, `MainScreen.kt`, `OnDemandMapScreens.kt`, `PayoutScreens.kt`, `OnDemandHubScreens.kt` — split facades and extracted components compile; MainScreen courier **258 baris**, Booking customer **349 baris**, dan Tracking customer **327 baris** sudah memenuhi target masing-masing.
- [x] Certificate pinning **runtime** attach ke OkHttp ✅ *DONE — NetworkModule.kt kedua app + Socket.IO + build-time enforcement*
- [x] Fake GPS detection advanced (sensor fusion) ✅ *DONE — FakeGpsDetector.kt (486 baris) + SensorFusionEngine.kt + enforcement loop*

### P1
 - [x] Batching multi-order UX jelas (urutan pickup/delivery) — ✅ **DONE 2026-08-31** — route plan courier menampilkan urutan pickup/dropoff per stop, package count, alamat, total jarak, ETA, dan fallback routing dari data API.
 - [x] Ghosting penalty & earnings breakdown transparan — ✅ **DONE 2026-08-31** — backend mengategorikan ghosting, menghitung deduction, membuat hold/ledger penalty + appeal; admin Driver Wallet Hold dan courier Earnings Ledger menampilkan dampaknya.
 - [x] Roadside proof flow lengkap (before/after + material list) — ✅ **DONE 2026-08-31** — before/after proof tetap diwajibkan oleh service-report contract; Android tambal ban mengirim pilihan material aktual (`materials_used_items`), backend memvalidasi report dan menyimpan daftar sebagai JSON di kolom legacy yang kompatibel; unit test service pass.
- [~] Android 15 compliance + haptic + pull-to-refresh — manifest/edge-to-edge, predictive back, haptic customer booking + courier order/service/SOS + merchant aksi kritis, serta pull-to-refresh customer dan merchant/courier screens sudah ada; coverage screen sekunder dan verifikasi device Android 15 masih pending.
- [~] a11y TalkBack critical path — semantic/content description pada action booking/POD sudah ada; walkthrough TalkBack booking, tracking, payment, dan POD di device fisik belum tervalidasi.
- [x] Shift / availability preference (opsional supply planning) — ✅ **DONE 2026-08-31** — courier dapat mengubah online/offline availability dan radius layanan 1–20 km melalui API/profile flow.

### P2
 - [x] In-app SOP / learning singkat onboarding — ✅ **DONE 2026-08-31** — profile courier menampilkan onboarding steps dari backend dan CTA training yang menyimpan completion ke `courier_training_completions` melalui API.
- [x] FCM Topic subscription — profile Android/backend membawa `current_zone.id`; `courier_all`, `courier_online`, dan `courier_zone_{zoneId}` dikelola idempotent termasuk unsubscribe zona lama.

---

## 11.4 Merchant App (`android-app-merchant/`) — Tasks

### P0
- [~] **Order alert reliable** (foreground + background + killed) — SLA accept 3 menit — 🔴 backend push (`push_service.go`) siap, tetapi merchant app belum dapat mengaktifkan FCM tanpa Firebase project config/credentials; polling foreground tetap dipakai sebagai fallback.
- [x] Prep timer + **mark food ready** yang jelas (trigger matching driver) — countdown memakai deadline server `food_ready_at`, status overdue jujur, dan tombol mark-ready tetap memanggil API matching.
- [x] **Partial reject / item unavailable** → partial refund customer — ✅ **DONE 2026-08-31** *Merchant API + Android item selector now call the existing order-service snapshot-priced refund contract; quantity/ownership validation, order event, and customer notification are wired and tested.*

- [~] Staff role & permission matang (multi-kasir) — merchant web staff invite/list/update API-wired; Android sekarang menerima `can_manage` dari backend dan otomatis read-only untuk staff tanpa izin; production role matrix verification remains.
- [x] Busy mode / pause orders — Android dashboard sudah memakai endpoint pause/resume berbasis durasi dan status `paused_until` dari backend.
- [x] Sold-out / inventory cepat per item — Manage Menu sudah memakai `setMenuItemAvailability` API per item.
- [x] Settlement & tax report jelas di app — ✅ **DONE 2026-08-31** — merchant web/Android settlement memakai endpoint real; tax report sekarang mengagregasi snapshot DPP/PPN order food delivered serta status invoice dari database, ditampilkan di settlement screen.
- [x] Performance dashboard (accept rate, cancel, rating) — ✅ **DONE 2026-08-31** — endpoint reports menghitung order masuk/diterima/dibatalkan/ditolak merchant dan rate dari orders, rating periode dari merchant_ratings; breakdown ditampilkan di merchant web Reports dan Android Business Insights.
- [x] Printer Bluetooth thermal stabil (EscPos sudah ada — harden) — ✅ **DONE 2026-08-31** — print dikunci satu-per-satu, koneksi/write memakai interruptible timeout 15 detik, payload dikirim per chunk, dan socket selalu ditutup; Android merchant compile/unit/lint pass.
- [x] Chat customer + driver konteks order — Android merchant order card membuka percakapan order-specific dan backend memakai `/mobile/chats/orders/{id}`.

### P2
- [x] Offline mode terbatas (lihat order terakhir) — ✅ **DONE 2026-08-31** — order terakhir disimpan per merchant di `EncryptedSharedPreferences`, hanya dipakai sebagai read-only fallback saat API gagal; mutation tetap server-only.
- [x] Menu bulk import — ✅ **DONE 2026-08-31** — Android ZIP menu menyediakan picker CSV, parser quoted-field, validasi nama/harga/kategori/waktu/availability, preview, upload baris valid ke API, serta ringkasan berhasil/gagal; parser unit-tested.

---

## 11.5 Merchant Web (`merchant-web/`) — Tasks

**Status sekarang:** Auth + dashboard/order/menu/settings plus promo, reports/export, settlement/withdraw, staff, print struk, bulk import, dan metrik advanced analytics berbasis database sudah API-wired. Build production verified 2026-08-31. Remaining: staging data/E2E verification.

### P0 (Merchant Portal v1 — minimal viable ops)
- [x] **Auth + dashboard web** setelah register approved
- [x] **Order management web** (list, accept/reject, mark ready)
- [x] **Menu management web** (CRUD + variant)
- [x] Toggle buka/tutup + jam operasional

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
- [x] Promo management web
- [x] Settlement & withdraw web
- [x] Staff management web
- [x] Laporan sederhana + export
- [x] Struk/print dari web (opsional) — ✅ **DONE 2026-08-31** — Orders portal mengambil struk server dari `/merchant/orders/{id}/struk`, merender item/status/total ke print window, dan me-escape nilai server sebelum dicetak.

### P2
- [~] Bulk menu import, advanced analytics — ✅ bulk import CSV dan metrik lanjutan (repeat customer, jam order tersibuk, accepted→ready) sudah API-wired dari data database dan terverifikasi build/test; staging data/E2E verification masih pending.

---

## 11.6 Admin Web (`admin-dashboard/`) — Tasks

### P0
- [~] **Broadcast Center** penuh (BAGIAN 10) — admin/backend/courier implementation, zona topic, and automated tests are done; admin full suite 36/36 suites and 194/194 tests pass; device E2E admin kirim → kurir terima masih perlu staging/device.
- [x] **Force cancel + refund flow** jelas (reason, partial/full, audit) — Admin Orders UI now calls `/admin/orders/:id/force-cancel`; backend validates reason/refund mode, TOTP/RBAC, DB audit, and refund trigger.
- [~] **RBAC multi-role** end-to-end (ops / finance / support / superadmin) — route/page role gates and backend role middleware exist; admin full suite 36/36 suites and 194/194 tests pass, including auth/role/TOTP paths; complete role matrix staging verification remains.

### P1
- [x] Evidence viewer (foto POD, GPS trail, chat log) untuk dispute — ✅ **DONE 2026-08-31** — admin order detail mengambil trusted GPS breadcrumb dari `courier_locations` (spoofed points dikecualikan), menampilkan slider playback, koordinat, waktu, akurasi, dan speed bersama POD/chat/proofs; staging data verification remains.
- [x] GPS spoofing / geofence alert **actionable** — admin endpoint `/admin/gps-risk-alerts` membaca proof rejection/spoof risk, action state tersimpan di `courier_gps_risk_actions`, acknowledge/resolve diaudit, dan Safety Command menyediakan kontrol operator.
- [x] Live ops map (semua kurir online + order aktif) sebagai command center — ✅ **DONE 2026-08-31** — `LiveMap` sekarang memuat kurir live dan feed `/admin/analytics/live-active-orders` setiap 15 detik; marker order memakai posisi courier terakhir yang non-spoofed atau pickup/dropoff sebagai fallback.
- [x] Meeting point management — ✅ **DONE 2026-08-31** — admin route `/meeting-points` CRUD memakai order-service `/api/v1/admin/meeting-points`; migration menambahkan `category`, analytics menampilkan koordinat/status/pemakaian, dan matching tetap memakai data yang sama.
- [x] Feature flag control UI penuh di admin ✅ *DONE — Settings.tsx toggle + reason + change log (⚠️ tombol navigate `/feature-flags` dari PricingConfig = dead link, perlu route atau dibenerin)*
- [x] Delivery report broadcast + audit — backend delivery report, audit trail, and admin broadcast history are wired.

### P2
- [x] Custom report builder — endpoint `/admin/analytics/custom-report` memakai grouping allowlist (hour/day/service/status), halaman admin menampilkan KPI dan tabel data order real serta export CSV.
 - [x] Courier churn / retraining workflow — ✅ **DONE 2026-08-31** — endpoint retention membaca aktivitas order/training real; admin dapat membuat, menjadwalkan, dan mengubah status retraining (`planned`/`in_progress`/`completed`/`cancelled`) dengan audit actor di database.
- [x] Campaign calendar (promo + broadcast) — admin route `/campaign-calendar` menggabungkan jadwal promo dan broadcast dari endpoint backend real, filter bulan, status, dan waktu eksekusi.
 - [x] SLO / error budget dashboard — ✅ **DONE 2026-08-31** — Prometheus recording rules + alert rule SLO, Grafana Operations Overview (availability, p95 latency, throughput), serta admin Analytics SLA memakai data API real.

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
8. **Merchant Web Portal** (dari 3/10 → P0/P1 ops portal API-wired; production verification and P2 remain)
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
