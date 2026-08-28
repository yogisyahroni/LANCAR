# Remediation Roadmap — Customer Mobile Audit 2026

Approved slice (2026-08-28): **P0 palette violation (OLD_BRAND) + NAV-01 navigation trap + stale guidelines doc.** Executed and compile-verified.

## Done (commit pending)

### P0 — OLD_BRAND palette purge
| File | Change |
|------|--------|
| `ui/navigation/RootNavGraph.kt` | promo badge tint `0xFFFF7A00`→`colorScheme.tertiary`; default badge tint `0xFF0D5C2F`→`colorScheme.primary`; "Buka" text `0xFF0D5C2F`→`colorScheme.primary` |
| `ui/screens/tracking/TrackingScreen.kt` | status dot `0xFFFF7A00`→`Accent` |
| `ui/components/maps/MapPrimitives.kt` | marker default `0xFF0D5C2F`→`Primary` |
| `app/src/main/res/values/colors.xml` | `primary`→`#003A20`, `accent`→`#F97316`, hapus `secondary`/`primary_dark` lama |
| `docs/TEMBUS_MOBILE_DESIGN_GUIDELINES_2026.md` | palette + radius disesuaikan ke approved 2026 (`#003A20`/`#F97316`/radius 12dp) |

### P1 — NAV-01 navigation trap
`DashboardScreen` tab Beranda `onClick={}` → `onHomeClick` param; `RootNavGraph` wires `onHomeClick` to `navController.popBackStack(Screen.Dashboard.route, inclusive=false) ?: navigate(Dashboard){launchSingleTop}`. Beranda kini reachable dari Riwayat/Bisnis/Profil.

### Verification
- `./gradlew compileDebugKotlin` → BUILD SUCCESSFUL (1m20s)
- `./gradlew testDebugUnitTest` → BUILD SUCCESSFUL (36 tasks)
- Grep `0x(FF)?(0D5C2F|FF7A00|138C3B)` across .kt/.xml → 0 (comment in colors.xml is documentation, not a value)

## Backlog (deferred — needs separate approval)

### P1 — Tailwind-gray token violations (121 occ → 75 fixed this slice)
Mapped neutral `color=`/`tint=` + light `surfaceVariant` `.background()` fills to `MaterialTheme.colorScheme.{onSurface,onSurfaceVariant,outlineVariant,surfaceVariant}` (adaptive, dark-mode safe) across 12 files:
`ChatScreen`(35→neutral mapped, 10 bg fills), `CompleteProfileScreen`(12), `ReferralScreen`(11), `MerchantRatingDialog`(11), `AddressBookScreen`(10), `LoyaltyScreen`(10), `TrackingScreen`(9→8), `InAppCallScreen`(8), `RootNavGraph`(4), `RuntimeMapRenderer`(4), `LanguageScreen`(1), `BusinessScreen`(1).
**Remaining 46:** non-light `.background()` fills (e.g. dark chat bubbles `0xFF1A1A1A`) intentionally left — needs per-occurrence semantic review, not blind token swap. Tracked as follow-up.

### P1 — `contentDescription = null` (112 occ / 37 files)
Verify each with TalkBack (Phase 4). Actionable icons need accessible names; decorative only stay null.

### P2 — Food tracking route parity (NAV-02)
Confirm food orders reuse `Screen.Tracking` with correct status stages vs parcel.

### P2 — InAppCall back-stack (NAV-03)
Verify post-call return doesn't strand user.
