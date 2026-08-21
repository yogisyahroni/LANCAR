# TEMBUS UI/UX Standardization

Created: 2026-08-21
Status: Active

## Goal

Standarkan UI/UX customer, kurir, dan merchant ke design system TEMBUS baru berdasarkan referensi palette light/dark mode:

- Primary Green: `#003A20`
- Accent Orange: `#F97316`
- Rasio penggunaan warna: 70% neutral/background, 20% primary green, 10% accent orange
- Light mode dan dark mode harus punya token yang konsisten
- Status/semantic color harus konsisten lintas app

Fokus fase ini adalah visual system, component consistency, accessibility, dan UX polish. Jangan gabungkan perubahan backend/business flow kecuali ada state UI yang terbukti rusak karena kontrak data.

## Source Of Truth

- Vault backlog: `E:/antigraviti google/SUDAH DEPLOY/vault/01 Projects/LANCAR/TEMBUS — UIUX Standardization Backlog 2026-08-21.md`
- ADR: `ADR-2026-08-21-C — TEMBUS UI/UX standardization across customer, courier, merchant`
- Visual reference: `c:/Users/yogis/Downloads/ChatGPT Image 21 Agu 2026, 23.32.43.png`
- Start branch/commit: `staging` at `105e1e7 fix: harden multi-service courier lifecycle`

## Design Tokens

### Light Mode

- [x] Green tokens: `#003A20`, `#005C32`, `#007A42`, `#E8F5EE`, `#F4FBF7`
- [x] Orange tokens: `#C95A00`, `#F97316`, `#FB923C`, `#FFF1E6`, `#FFF8F2`
- [x] Neutral tokens: background `#F7F8F7`, surface `#FFFFFF`, tertiary bg `#F0F3F1`, border `#E5E9E6`, text primary `#14211A`, text secondary `#6B756F`, text tertiary `#98A19C`, disabled `#B8C0BB`
- [x] Semantic tokens: success `#16A34A`, warning `#F59E0B`, error `#DC2626`, info `#2563EB`

### Dark Mode

- [x] Green tokens: `#1A7A4C`, `#23915B`, `#52B788`, `#0D3322`, `#F4F8F3`
- [x] Orange tokens: `#C95A00`, `#FB923C`, `#FDA66A`, `#3D2414`, `#2A160C`
- [x] Neutral tokens: background `#0B120E`, surface `#142019`, elevated surface `#1B2921`, border `#26352C`, text primary `#F4F7F5`, text secondary `#AAB5AE`, text tertiary `#78857D`, disabled `#556158`
- [x] Semantic tokens: success `#16A34A`, warning `#F59E0B`, error `#F87171`, info `#60A5FA`

## Rules

- [ ] No emoji UI: pakai Material Icons/lucide/system icons.
- [ ] No package vocabulary leakage di tambal ban/towing.
- [ ] Angka wajib punya unit jelas: `Rp` untuk rupiah, `%` untuk persen, km/meter untuk jarak.
- [ ] Semua hardcoded color yang bukan token harus diaudit dan diganti atau diberi alasan.
- [x] Card radius maksimal 8dp/8px kecuali existing component system meminta lain.
- [ ] Text tidak boleh overflow/overlap di mobile, compact panel, chip, button, dialog, timeline, dan bottom sheet.
- [ ] UI operasional courier/merchant harus tetap ringkas, mudah discan, dan tidak berubah jadi landing-page style.
- [ ] Aksi kritis tetap memakai confirmation/swipe sesuai risiko.

## Phase 0 — Audit Baseline

- [x] Audit file theme/token Android customer.
- [x] Audit file theme/token Android courier.
- [x] Audit file theme/token Android merchant.
- [x] Audit token CSS/Tailwind web customer.
- [x] Audit token CSS/Tailwind admin dashboard.
- [x] Audit token CSS/Tailwind merchant web jika ada.
- [x] Buat daftar hardcoded hex/RGB/Color.* yang perlu diganti.
- [x] Buat daftar screen utama per app untuk screenshot regression.
- [x] Identifikasi component yang sudah reusable vs one-off.

## Phase 1 — Token Foundation

- [x] Implement canonical TEMBUS color tokens di Android customer.
- [x] Implement canonical TEMBUS color tokens di Android courier.
- [x] Implement canonical TEMBUS color tokens di Android merchant.
- [x] Implement/align web CSS variables atau Tailwind tokens untuk TEMBUS.
- [x] Pastikan light/dark theme memakai token yang sama namanya lintas app.
- [x] Tambah semantic alias: success, warning, error, info, pending, active, completed, cancelled, disabled.
- [ ] Update component primitive bila ada: button, chip, card, input, dialog, top bar, bottom nav, timeline, proof card.

## Phase 2 — Customer App Migration

- [x] Dashboard/home customer.
- [x] Service category dan service selector.
- [x] Booking paket.
- [ ] Booking food.
- [ ] Booking tambal ban.
- [ ] Booking towing.
- [ ] Payment/wallet/checkout surfaces.
- [ ] Tracking active order.
- [ ] Order history/detail/proof.
- [ ] Auth/profile/settings.
- [ ] Empty, loading, error, offline states.
- [ ] Light/dark screenshot pass.
- [ ] `android-app-customer` compile/build pass.

## Phase 3 — Courier App Migration

- [ ] Main/home courier.
- [ ] Order list dan offer cards.
- [ ] Order detail package/food.
- [ ] Tambal ban flow: arrival, inspection, in-progress, completion, proof.
- [ ] Towing flow: pickup, inspection, loading, transit, unloading, completion, signature/proof.
- [ ] Earnings breakdown dan settlement copy.
- [ ] Face verification.
- [ ] Registration/profile/capability settings.
- [ ] Empty, loading, error, offline states.
- [ ] Light/dark screenshot pass.
- [ ] `android-app` compile/build pass.

## Phase 4 — Merchant App Migration

- [ ] Dashboard merchant.
- [ ] Order queue active/preparing/ready/picked/delivered.
- [ ] Menu CRUD.
- [ ] Settlement/report.
- [ ] Struk/print preview.
- [ ] Store profile/onboarding.
- [ ] Open/closed/scheduled states.
- [ ] Empty, loading, error, offline states.
- [ ] Light/dark screenshot pass.
- [ ] `android-app-merchant` compile/build pass.

## Phase 5 — Web Portal Alignment

- [ ] Customer web token alignment where applicable.
- [ ] Admin dashboard token alignment: order detail, finance, stuck diagnostics, lifecycle/proof.
- [ ] Merchant web token alignment where applicable.
- [ ] Replace hardcoded visual colors with tokens.
- [ ] Keep dense operational dashboard layouts; no marketing hero treatment.
- [ ] Build pass for touched web apps.
- [ ] Playwright smoke for touched customer/admin/merchant web flows.

## Phase 6 — Accessibility And Visual QA

- [ ] Contrast check for all primary/secondary/semantic combinations.
- [ ] Touch target check for mobile controls.
- [ ] Text scaling check for key Android screens.
- [ ] Loading/error/empty state consistency.
- [ ] Dark mode legibility check.
- [ ] Map/action panel overlap check.
- [ ] Bottom navigation and top app bar inset check.
- [ ] Screenshot/video evidence saved for critical screens.

## Phase 7 — Integration With Parked E2E

- [ ] Re-run Android compile/test for customer, courier, merchant.
- [ ] Re-run backend build/tests if UI changes touch contracts.
- [ ] Re-run web builds for touched portals.
- [ ] Re-run Playwright smoke for touched web surfaces.
- [ ] Update parked P0 E2E task with any UI-related acceptance criteria already satisfied.
- [ ] Resume manual UAT real accounts after UI standardization reaches stable baseline.

## Acceptance Criteria

- [ ] Customer, courier, and merchant apps share the same TEMBUS token language.
- [ ] Light/dark mode visually matches the new TEMBUS palette.
- [ ] Primary actions use green; high-energy/action accents use orange sparingly.
- [ ] Status colors are consistent and readable across all apps.
- [ ] No visible emoji UI remains in migrated surfaces.
- [ ] Tambal ban/towing screens do not show package-specific copy.
- [ ] Text, buttons, chips, cards, and dialogs do not overflow or overlap on common mobile sizes.
- [ ] All touched apps compile/build successfully.
- [ ] Screenshot regression confirms customer, courier, merchant key screens in light and dark mode.

## Progress Log

- 2026-08-21: Task created from user request to start UI standardization phase after parking remaining P0 E2E validation tasks in vault.
- 2026-08-21 23:55: Slice 1 token foundation completed. Android customer/courier/merchant and frontend/admin/merchant web now expose canonical TEMBUS green/orange/neutral/semantic tokens. Android Material color schemes aligned for light/dark mode, merchant gained shared shape tokens, and customer/courier/merchant radius tokens now use 8dp for cards/sheets/buttons/inputs. Baseline hardcoded color hotspots: customer Android 491, courier Android 173, merchant Android 86, web surfaces 169.
- 2026-08-21 23:55: Verification passed: `android-app :app:compileDebugKotlin`, `android-app-customer :app:compileDebugKotlin`, `android-app-merchant :app:compileDebugKotlin`, `frontend npm run build`, `admin-dashboard npm run build` with staging env placeholders, and `merchant-web npm run build`.
- 2026-08-22: Phase 0 completed. Screenshot regression and component audit lists are now defined below.
- 2026-08-22: Customer dashboard/home migrated to TEMBUS tokens. Removed off-brand service tile colors, emoji/pictographic status prefixes, unicode arrow CTA copy, negative letter spacing, and oversized card radii from `DashboardScreen.kt`. Customer Android `:app:compileDebugKotlin` PASS.
- 2026-08-22: Customer service category/selector migrated to TEMBUS tokens. `ServiceCategoryScreen.kt` and `SubTypeSelectorScreen.kt` now use shared card radius, token borders, palette-safe category colors, and no emoji note copy. Customer Android `:app:compileDebugKotlin` PASS.
- 2026-08-22: Customer package booking migrated to TEMBUS tokens. `BookingScreen.kt` now removes hardcoded hex colors, oversized booking card radii, pictographic arrow copy, and local white/neutral surfaces in favor of TEMBUS surface/outline/semantic tokens. Customer Android `:app:compileDebugKotlin` PASS.

## Screenshot Regression Matrix

### Customer Android

- Dashboard/home: logged-in normal, loading/error profile, active order card.
- Auth/profile: login, OTP, complete profile, profile/settings.
- Package: booking form, payment, tracking, order detail/history.
- Food: food home, merchant detail, cart, checkout, favorites, food tracking/history.
- Tambal ban: home, search, courier detail, service booking, service tracking, service report.
- Towing: service category/subtype, service booking with pickup/dropoff, tracking, report/proof.
- Support surfaces: notifications, chat, in-app call, address book, loyalty/referral.

### Courier Android

- Main/home: online/offline, offer card, active job.
- Package/food: order list, order detail, scan, face verification, POD.
- Tambal ban: arrival, inspection, damage type, in-progress, completion proof.
- Towing: pickup, inspection, loading, transit, unloading, signature/completion proof.
- Ops/support: inbox, chat, in-app call, service upgrade, registration, KTP scan, liveness.
- Earnings: earnings breakdown, performance/profile.

### Merchant Android

- Auth/onboarding/registration.
- Dashboard: normal, API error, empty state.
- Order queue: active/preparing/ready/picked/delivered and order edit.
- Menu: list, CRUD, variants.
- Report/settlement.
- Struk/print preview.
- Profile/staff/promo/chat.

### Web Portals

- Customer web: dashboard, order creation package/on-demand/aggregator, order detail, tracking, payment link, profile/address.
- Admin dashboard: dashboard, active orders, order detail, finance/settlement, stuck diagnostics, proof/audit trail.
- Merchant web: landing/register/status/success, location picker, merchant operational surfaces if enabled.

## Component Audit

### Reusable Foundations

- Android customer: `TembusComponents.kt`, `ServiceGridMenu.kt`, `ServiceIcons.kt`, `ServiceProgressBar.kt`, `CourierPriceCard.kt`, `PhotoComparisonView.kt`, `VehicleDetailInput.kt`, `UpdateDialog.kt`, map renderer/primitives.
- Android courier: `BidirectionalSwipeSlider.kt`, `BatteryOptimizationCard.kt`, `UpdateDialog.kt`, service components (`AvailabilityToggle`, `EarningsBreakdown`, `ServiceModeSelector`, `ServicePriceInput`, `ServiceProgressBar`, `ServiceSelectionCard`, `ServiceTaskCard`, `TambalBanProgressSteps`, `TowingProgressSteps`), map renderer/primitives.
- Android merchant: `LocationPickerSection.kt`, `UpdateDialog.kt`.
- Web: global CSS token utilities in `frontend`, `admin-dashboard`, and `merchant-web`; additional repeated table/card/status patterns still need extraction during screen migration.

### One-Off/Needs Migration

- Customer Android high-hardcode zones: `DashboardScreen`, food screens, booking/payment/tracking/history, service booking/tracking/report.
- Courier Android high-impact zones: `MainScreen`, `OrderDetailScreen`, service flow screens, map fallback surfaces, performance screen.
- Merchant Android: dashboard/home/report/profile still have local visual decisions; smaller count but should move toward shared tokens/components.
- Web: admin charts/live map/status colors, merchant-web landing/register hardcoded brand colors, customer web order form/map visualization colors.
