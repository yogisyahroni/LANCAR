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

### P1 — Tailwind-gray token violations (121 occ)
Highest density: `ChatScreen`(33), `CompleteProfileScreen`(12), `LoyaltyScreen`(10), `ReferralScreen`(10), `MerchantRatingDialog`(10), `AddressBookScreen`(9), `TrackingScreen`(9). Replace hardcoded `0xFF111827`/`0xFF667085`/`0xFFE5E7EB`/etc → `OnSurface`/`OnSurfaceVariant`/`Outline`/`SurfaceVariant`.

### P1 — `contentDescription = null` (112 occ / 37 files)
Verify each with TalkBack (Phase 4). Actionable icons need accessible names; decorative only stay null.

### P2 — Food tracking route parity (NAV-02)
Confirm food orders reuse `Screen.Tracking` with correct status stages vs parcel.

### P2 — InAppCall back-stack (NAV-03)
Verify post-call return doesn't strand user.
