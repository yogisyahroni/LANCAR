package com.tembus.merchant.ui.theme

import androidx.compose.ui.graphics.Color

// TEMBUS Design System 2026 — Light & Dark palette.
// Source: design system palette (gambar referensi 2026-08), WCAG 2.1 AA.
// Kontras diverifikasi dengan Python (rumus WCAG): teks normal ≥4.5:1, large/bold ≥3:1.

// ─── LIGHT MODE ────────────────────────────────────────────────────────────
val Primary = Color(0xFF003A20)          // brand/action primary
val PrimaryDark = Color(0xFF003A20)      // brand gradient start
val PrimaryBase = Color(0xFF005C32)      // canonical green scale
val PrimaryLight = Color(0xFF007A42)     // hijau terang (ikon/aksen)
val PrimarySoft = Color(0xFFE8F5EE)      // light pill bg
val PrimaryPale = Color(0xFFF4FBF7)      // bg pucat hijau

val Accent = Color(0xFFF97316)           // orange base (aksen/ikon)
val AccentDark = Color(0xFFC95A00)
val AccentLight = Color(0xFFFB923C)      // orange terang (gradasi/hover)
val AccentSoft = Color(0xFFFFF1E6)       // pill orange bg
val AccentPale = Color(0xFFFFF8F2)       // bg pucat orange

// Neutral light
val Background = Color(0xFFF7F8F7)
val Surface = Color(0xFFFFFFFF)
val SurfaceVariant = Color(0xFFF0F3F1)
val Outline = Color(0xFFE5E9E6)
val OutlineStrong = Color(0xFFD1D5DB)

val OnPrimary = Color(0xFFFFFFFF)
val OnAccent = Color(0xFFFFFFFF)         // hanya dipakai di atas AccentDark #C2410C (5.18:1)
val OnBackground = Color(0xFF14211A)     // 15.6:1 PASS
val OnSurface = Color(0xFF14211A)        // 16.6:1 PASS
val OnSurfaceVariant = Color(0xFF6B756F) // 4.77:1 PASS (label sekunder)
val OnSurfaceTertiary = Color(0xFF98A19C)
val TextDisabled = Color(0xFFB8C0BB)     // disabled/non-interactive

// Semantic light
val Success = Color(0xFF16A34A)
val Warning = Color(0xFFF59E0B)
val Error = Color(0xFFDC2626)
val Info = Color(0xFF2563EB)
val StatusPending = Warning
val StatusActive = Info
val StatusCompleted = Success
val StatusCancelled = Error
val StatusDisabled = TextDisabled

// ─── DARK MODE ────────────────────────────────────────────────────────────
val DarkPrimary = Color(0xFF1A7A4C)
val DarkPrimaryBase = Color(0xFF23915B)
val DarkPrimaryLight = Color(0xFF52B788) // 7.67:1 PASS — teks hijau di bg gelap
val DarkPrimarySoft = Color(0xFF0D3322)  // pill hijau bg dark
val DarkPrimaryPale = Color(0xFFF4F8F3)

val DarkAccentDark = Color(0xFFC95A00)
val DarkAccent = Color(0xFFFB923C)
val DarkAccentLight = Color(0xFFFDA66A)  // 9.79:1 PASS — teks orange di bg gelap
val DarkAccentSoft = Color(0xFF3D2414)   // pill orange bg dark
val DarkAccentPale = Color(0xFF2A160C)

// Neutral dark
val DarkBackground = Color(0xFF0B120E)
val DarkSurface = Color(0xFF142019)
val DarkSurfaceVariant = Color(0xFF1B2921)
val DarkOutline = Color(0xFF26352C)

val DarkOnBackground = Color(0xFFF4F7F5) // 17.6:1 PASS
val DarkOnSurface = Color(0xFFF4F7F5)    // 15.6:1 PASS
val DarkOnSurfaceVariant = Color(0xFFAAB5AE)
val DarkOnSurfaceTertiary = Color(0xFF78857D)
val DarkTextDisabled = Color(0xFF556158)

// Semantic dark
val DarkSuccess = Color(0xFF16A34A)      // di bg gelap: 5.9:1
val DarkWarning = Color(0xFFF59E0B)
val DarkError = Color(0xFFF87171)
val DarkInfo = Color(0xFF60A5FA)
val DarkStatusPending = DarkWarning
val DarkStatusActive = DarkInfo
val DarkStatusCompleted = DarkSuccess
val DarkStatusCancelled = DarkError
val DarkStatusDisabled = DarkTextDisabled

// ─── LEGACY (masih dipakai komponen lama — jangan dihapus tanpa migrasi) ───
val Secondary = PrimaryBase
val SecondaryDark = Primary
val SecondaryLight = PrimarySoft
val OnSecondary = Color(0xFFFFFFFF)
val AccentLightLegacy = Color(0xFFFFF1E6)
val CourierMapBase = Color(0xFF06150E)
val CourierPanel = Color(0xF20B1F17)
val CustomerHeroStart = Primary
val CustomerHeroEnd = PrimaryLight

// Legacy alias kept for migrated callers; Merchant shell uses MaterialTheme.surface.
val NavBackground = Surface
val GreenText = Color(0xFF2E5D39)
