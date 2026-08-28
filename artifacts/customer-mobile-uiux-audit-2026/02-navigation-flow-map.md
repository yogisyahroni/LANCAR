# Phase 1 — Information Architecture & Navigation Audit

Derived statically from `ui/navigation/Screen.kt` + `ui/navigation/RootNavGraph.kt` + `screens/main/DashboardScreen.kt`. Device traversal (tap counts, back-stack behavior) is **Phase 2/5** work.

---

## 1. Launch → Auth → Logged-in entry

```
Splash / MainActivity
  └─ MainViewModel.startDestination (state)
       ├─ not-authenticated → Screen.AuthGraph        (popUpTo(0) inclusive)
       └─ authenticated     → Screen.Dashboard
Onboarding (first-run only) → completeOnboarding() → nextRoute (Dashboard or AuthGraph)
```

Deep links handled in `RootNavGraph` LaunchedEffect:
- `/orders/{id}/chat` → `Screen.Chat`
- `/orders/{id}/tracking` → `Screen.Tracking`

Incoming call invite (`viewModel.incomingCallInvites`) → `Screen.InAppCall` (incoming, launchSingleTop).

Session expiry (`SessionInvalidationReason.TOKEN_EXPIRED`) → Toast "Sesi kamu sudah berakhir…" (no forced nav — verify in Phase 2A whether user is actually returned to auth).

---

## 2. Global shell — Bottom Navigation (DashboardScreen)

4 tabs, `NavigationBar` + `tembusNavigationColors()` (uses `MaterialTheme` tokens — ✅ on-brand):

| Tab | Icon | Label | Action |
|-----|------|-------|--------|
| Beranda | `LocalShipping` | Beranda | **`onClick = {}` — NO-OP** ⚠️ |
| Riwayat | `History` | Riwayat | `onHistoryClick` → `Screen.History` |
| Bisnis | `Store` | Bisnis | `onBusinessClick` → `Screen.Business` |
| Profil | `Person` | Profil | `onProfileClick` → `Screen.Profile` |

### 🔶 Finding NAV-01 (P1)
The **Beranda tab is permanently `selected = true` with `onClick = {}`**. It never navigates and can't be re-selected after leaving Dashboard. Tapping Riwayat/Bisnis/Profil works, but there is **no way back to Beranda except system back or restart** from within those tabs. This is a navigation trap (Phase 1 criterion: "unexpected dashboard resets / dead ends"). Confirm in Phase 2 whether `History`/`Business`/`Profile` screens render their own `NavigationBar` or rely on system back.

Top of Dashboard: green hero band (`LcGreen`) + `GojekTopBar` (name, unread badge, profile) + `WalletCard` + `GojekServiceGrid` (pickup, food, tambal_ban, towing) + optional `GlobalBannerCard` + `NotificationPermissionPromptCard` + `IncomingPackagesSection` (active orders) + `DashboardDataErrorCard` (honest error state ✅).

---

## 3. Service verticals — entry points

### Package (pickup/kirim)
`Dashboard GojekServiceGrid.onPickupClick` → `onBookingClick("pickup")` → `Screen.Booking` (query `open`).
Food: `onFoodClick` → `Screen.FoodHome`.
Tambal ban: `onBookingClick("tambal_ban")` → `Screen.Booking` / `Screen.ServiceCategory`.
Towing: `onBookingClick("towing")` → `Screen.Booking` / `Screen.ServiceCategory`.

### Tambal Ban & Towing flow
`ServiceCategory` → `SubTypeSelector/{category}` → `TambalBanHome` / `TambalBanSearch/{lat}/{lng}` → `CourierDetail/{courierId}` → `ServiceBooking/{serviceSubType}` (+ optional preselected courier) → `ServiceTracking/{orderId}/{serviceSubType}` → `ServiceReport/{orderId}/{serviceSubType}`.
Also `NearbyCouriers/{serviceSubType}/{lat}/{lng}`.

### Food flow
`FoodHome` → `FoodMerchantDetail/{merchantId}` → `FoodCart` → `FoodCheckout` → (payment) → `FoodFavorites` (saved). Note: no dedicated food-tracking route — food tracking reuses `Screen.Tracking`/`Screen.ServiceTracking` depending on order type (verify continuity in Phase 2D).

---

## 4. Order-scoped detail stack

`Screen.Dashboard` (IncomingPackages) → `Screen.Tracking/{orderId}` / `Screen.OrderDetail/{orderId}` / `Screen.Payment/{orderId}` / `Screen.Chat/{orderId}` / `Screen.InAppCall/{orderId}`.

All 5 detail routes are in `secureScreenRequired` set (SecureScreenEffect enabled) ✅ — sensitive surfaces are guarded.

---

## 5. Account / settings branch

`Profile` → `Screen.Language`, `Screen.Referral`, `Screen.Loyalty`, `Screen.Notifications`, address book, wallet/withdraw (`WithdrawDialog`), dispute (`DisputeDialog`), rating (`MerchantRatingDialog`/`CourierRatingDialog`/`TipDialog`), logout.

---

## 6. Navigation findings (preliminary — confirm device in Phase 2)

| ID | Sev | Finding | Evidence |
|----|-----|---------|----------|
| NAV-01 | P1 | Beranda tab no-op (`onClick={}`, forced `selected=true`); no in-app return path from Riwayat/Bisnis/Profil | `DashboardScreen.kt:172-199` |
| NAV-02 | P2 | Food has no distinct tracking route; may share `Tracking` with parcel — verify status-stage parity | `Screen.kt` food routes vs `Tracking` |
| NAV-03 | P3 | `InAppCall` launched via `launchSingleTop` from invite — confirm back-stack after call end doesn't strand user | `RootNavGraph.kt:183-189` |

Deep-link + secure-screen coverage is **good** (all 5 detail routes guarded, deep links routed). No unreachable route in `Screen.kt`.

---

## 7. Benchmark gap (Phase 6, device)

Gojek/Grab super-apps keep **Home always reachable** via bottom-nav reselect; TEMBUS breaks this (NAV-01). Tap-count comparison (home→reviewed order) deferred to Phase 6 with emulator.
