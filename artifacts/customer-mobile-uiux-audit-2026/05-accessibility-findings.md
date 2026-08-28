# Phase 4 — Accessibility Findings (static classification)

**112 `contentDescription = null` across 37 files** (full list in `evidence/` scan). Device/TalkBack verification is **blocked on emulator** (Phase 4 cannot be honestly completed statically). Below is the static classification from surrounding code context — each "NEEDS DEVICE" row requires a TalkBack pass before sign-off.

## Classification rule
- **DECORATIVE (likely OK):** icon inside a `Box(contentAlignment=Center)` that has a sibling `Text` label; rating/placeholder graphics; map tiles. `null` is correct.
- **NEEDS DEVICE:** icon is the only content of a tappable control with no adjacent text; or meaning isn't inferable from context. Must verify + add `contentDescription` or `semantics { }` merge.

## Decorative (from context — high confidence)
| File | Line | Why decorative |
|------|------|----------------|
| DashboardScreen | 429,544,582,629,703,831,860 | status icon inside labeled `Box` w/ sibling text |
| FoodFavoritesScreen | 162 | icon container w/ rating text sibling |
| FoodHome/MerchantDetail | 214,353,215,276 | `avgRating` Row has numeric text |
| BookingComponents | 171,222,536,1479 | step/selection icon + adjacent text |
| CourierPriceCard | 99,124 | conditional status icon + label text |
| ServiceGridMenu | 214,264 | service icon (grid label provided elsewhere) |
| RuntimeMapRenderer | 368 | map tile (image, decorative) |
| RootNavGraph | 688 | notification category icon (has title text) |
| OrderDetailScreen | 528 | status chip w/ text |
| NotificationCenterScreen | 118,212 | has text action/label |

## Needs device verification (actionable icon ambiguity)
| File | Line | Risk |
|------|------|-------|
| CourierPriceCard / ServiceGridMenu | — | service grid tap target — is label exposed to a11y? |
| BookingComponents:1479 | search/check icon | is selection state announced? |
| InAppCallScreen | 301,410 | mic / call-end buttons — **critical a11y** |
| ChatScreen | 469,657 | chat FAB / empty icon |
| LanguageScreen | 82 | selected-row indicator |
| CompleteProfile/OtpVerify/Login | 127,225,258,677,899,1002,160,167 | status/lock icons in forms |
| FoodCartScreen | 118 | cart empty icon |
| FoodFavoritesScreen | 112 | empty-state icon |
| OrderHistoryScreen | 265,411 | reorder / empty-state buttons |
| OrderDetailScreen | 306,318,333,353,368 | action buttons (pay/dispute/cancel) |

**Verdict:** cannot mark a11y PASS without emulator. The existing `SemanticsHelpers.kt` + `PaymentScreen`/`ServiceTrackingScreen`/`ProofOfDeliveryScreen` wiring (roadmap 2.1 DONE) covers the critical payment/tracking paths; the 112 `null`s are mostly decorative but the "needs device" subset must be TalkBack-verified.

## Contrast
Token palette (`Color.kt`) already WCAG-verified (contrast computed in-file: OnSurface 15.6:1, OnAccent 6.77:1, OnSurfaceVariant 5.11:1). No contrast violation expected from the approved tokens. OLD_BRAND (P0) removed. Remaining risk: any `null` icon that is the sole affordance on a low-contrast surface — device check only.
