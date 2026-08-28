# Phase 0 — Palette & Token Audit (deep dive)

**Scope:** all `Color(0xRRGGBB)` / `Color(0xAARRGGBB)` int literals in `android-app-customer` Kotlin (excl. `build/`).
**Goal:** classify every direct color as token-violation / semantic-exception / map-partner-brand / test-debug, so remediation can target token-violations only.

---

## 1. Approved token set (source of truth — `ui/theme/Color.kt`)

Brand: `Primary #003A20`, `PrimaryBase #005C32`, `PrimaryLight #007A42`, `Accent #F97316`, `AccentDark #C95A00`.
Neutrals: `Background #F7F8F7`, `Surface #FFFFFF`, `SurfaceVariant #F0F3F1`, `Outline #E5E9E6`, `OutlineStrong #D1D5DB`, `OnBackground/OnSurface #14211A`, `OnSurfaceVariant #626C67`, `TextDisabled #B8C0BB`.
Semantic: `Success #16A34A`, `Warning #F59E0B`, `Error #DC2626`, `Info #2563EB` (+ dark-mode equivalents).
Dark: `DarkBackground #0B120E`, `DarkSurface #142019`, `DarkPrimary #1A7A4C`, `DarkAccent #FB923C`, etc.

Any `Color(0x..)` whose RGB is **not** in the above set is a candidate token-violation unless it is a documented exception (map/partner brand, chart, photo overlay).

---

## 2. Classification totals (320 occurrences)

| Class | Count | Disposition |
|-------|-------|-------------|
| `token_ok` | 60 | Correct value, just written as literal — optional cleanup |
| `OLD_BRAND` | 5 | **MUST FIX** → `Primary`/`Accent` |
| `TAILWIND_GRAY` | 121 | **MUST FIX** → neutral tokens (`OnSurface`/`Outline`/`SurfaceVariant`) |
| `partner_or_exc` | 61 | Review; many legit (semantic status, teal partner, gold tier) |
| `unclassified` | 73 | Review; likely soft tints / near-token greys |

### 2.1 Distinct unclassified RGB (73 occ, 62 distinct) — sample

`0x17212B`, `0xE1E7EF`, `0x075C2F`, `0xF6F8F7`, `0xFFF4E5`, `0x0B3D2A`, `0xE53935`, `0xB42318`, `0xFFF1F1`, `0x047857`, `0x475467`, `0x526173`, `0xD97706`, `0x8B5CF6` (loyalty purple), `0x10B981`, `0x25D366` (WhatsApp green — partner), `0x1A0E00` (OnAccent def), `0xFDA66A` (DarkAccent def), `0x06150E` (CourierMapBase def).

Most unclassified are (a) near-duplicates of token tints (e.g. `0xF6F8F7`≈`Background`), or (b) intentional semantic/partner colors. None are obvious OLD_BRAND. Final per-occurrence call happens in remediation, not audit.

---

## 3. OLD_BRAND — mandatory fix list (P0)

| File | Line | Current | Should be |
|------|------|---------|-----------|
| `ui/navigation/RootNavGraph.kt` | 685 | `Color(0xFFFF7A00)` promo badge tint | `Accent` |
| `ui/navigation/RootNavGraph.kt` | 686 | `Color(0xFF0D5C2F)` default badge tint | `Primary` |
| `ui/navigation/RootNavGraph.kt` | 711 | `Color(0xFF0D5C2F)` "Buka" text | `Primary` |
| `ui/screens/tracking/TrackingScreen.kt` | 561 | `Color(0xFFFF7A00)` status dot bg | `Accent` |
| `ui/components/maps/MapPrimitives.kt` | 70 | `Color(0xFF0D5C2F)` marker default | map token / `CourierMapBase` |

Plus `app/src/main/res/values/colors.xml` (legacy `<color name="primary">#0D5C2F</color>`, `<color name="accent">#FF7A00</color>`) — remove or alias to tokens to prevent reuse.

---

## 4. TAILWIND_GRAY — highest-value token-violation cluster (P1)

121 hardcoded neutral grays. Top offenders:

- `0xFF111827` (≈`OnSurface #14211A`) — 13×
- `0xFF667085` (≈`OnSurfaceVariant #626C67`) — 15×
- `0xFF94A3B8` — 12×
- `0xFF64748B` — 7×
- `0xFF0F172A` — 8×
- `0xFFE5E7EB` (≈`Outline #E5E9E6`) — 8×
- `0xFF6B7280` — 7×
- `0xFF9CA3AF` — 7×

Concentrated in `ChatScreen.kt` (33), `CompleteProfileScreen.kt` (12), `LoyaltyScreen.kt` (10), `ReferralScreen.kt` (10), `MerchantRatingDialog.kt` (10), `AddressBookScreen.kt` (9), `TrackingScreen.kt` (9). These are the **first remediation slice** after OLD_BRAND: replace with `OnSurface` / `OnSurfaceVariant` / `Outline` / `SurfaceVariant` tokens.

---

## 5. Partner / brand exceptions (likely legit — verify, don't auto-fix)

- Tambal-ban teal `#00AED6` / `#008EB0` — service brand, intentional.
- WhatsApp `#25D366`, Gojek-ish greens, gold tier `#D4AF37`/`#B45309` — partner/loyalty.
- Semantic `Success/Warning/Error/Info` written as literal (e.g. `0xFF16A34A`, `0xFFF59E0B`, `0xFFDC2626`, `0xFF2563EB`) — should ideally use `Success`/`Warning`/`Error`/`Info` tokens but values match; low priority.

---

## 6. Output artifact

`evidence/color_int_classified.json` — `{ totals, byfile: {file: {class:count}}, unclassified: {rgb:count} }`.
