package com.tembus.courier.ui.theme

import androidx.compose.ui.graphics.Color

// TEMBUS Design System 2026 — Light & Dark palette.
// Source: design system palette (gambar referensi 2026-08), WCAG 2.1 AA.
// Kontras diverifikasi dengan Python (rumus WCAG): teks normal ≥4.5:1, large/bold ≥3:1.

// ─── LIGHT MODE ────────────────────────────────────────────────────────────
val Primary = Color(0xFF006437)          // color.primary
val PrimaryDark = Color(0xFF003A20)      // brand gradient start
val PrimaryBase = Color(0xFF006437)      // canonical green scale
val PrimaryLight = Color(0xFF007A42)     // hijau terang (ikon/aksen)
val PrimarySoft = Color(0xFFE8F5EE)      // light pill bg
val PrimaryPale = Color(0xFFF4FBF7)      // bg pucat hijau

val Accent = Color(0xFFC2410C)           // color.accent
val AccentDark = Color(0xFF9A3412)
val AccentLight = Color(0xFFEA580C)      // color.accent-light
val AccentSoft = Color(0xFFFFF1E6)       // pill orange bg
val AccentPale = Color(0xFFFFF8F2)       // bg pucat orange

// Neutral light
val Background = Color(0xFFF7F8F7)
val Surface = Color(0xFFFFFFFF)
val SurfaceVariant = Color(0xFFEEF3EF)
val Outline = Color(0xFFC7D1CA)
val OutlineStrong = Color(0xFF718078)
val InputBorder = Color(0xFF66756C)

val OnPrimary = Color(0xFFFFFFFF)
val OnSurfaceSecondary = Color(0xFF415047)
val OnAccent = Color(0xFFFFFFFF)
val OnBackground = Color(0xFF14211A)     // 15.6:1 PASS
val OnSurface = Color(0xFF14211A)        // 16.6:1 PASS
val OnSurfaceVariant = Color(0xFF5F6B63) // canonical foreground-muted
val OnSurfaceTertiary = Color(0xFF98A19C)
val TextDisabled = Color(0xFFB8C0BB)     // disabled/non-interactive
val OnSuccess = Color(0xFFFFFFFF)
val OnWarning = Color(0xFFFFFFFF)
val OnError = Color(0xFFFFFFFF)
val OnInfo = Color(0xFFFFFFFF)
val Selection = Color(0xFFB7E4C7)
val Scrim = Color(0xFF14211A)

// Semantic light
val Success = Color(0xFF15803D)
val Warning = Color(0xFFB45309)
val Error = Color(0xFFB91C1C)
val Info = Color(0xFF1D4ED8)
val StatusPending = Warning
val StatusActive = Info
val StatusCompleted = Success
val StatusCancelled = Error
val StatusDisabled = TextDisabled

// ─── DARK MODE ────────────────────────────────────────────────────────────
val DarkPrimary = Color(0xFF34D399)
val DarkPrimaryBase = Color(0xFF23915B)
val DarkPrimaryLight = Color(0xFF6EE7B7)
val DarkPrimaryDark = Color(0xFF007A42)
val DarkPrimarySoft = Color(0xFF123B25)  // pill hijau bg dark
val DarkPrimaryPale = Color(0xFF0D3322)

val DarkAccentDark = Color(0xFFC2410C)
val DarkAccent = Color(0xFFFB923C)
val DarkAccentLight = Color(0xFFFDBA74)
val DarkAccentSoft = Color(0xFF4A3210)   // pill orange bg dark
val DarkAccentPale = Color(0xFF3D2414)

// Neutral dark
val DarkBackground = Color(0xFF0B120E)
val DarkSurface = Color(0xFF142019)
val DarkSurfaceVariant = Color(0xFF1B2921)
val DarkSurfaceSubtle = Color(0xFF203329)
val DarkOutline = Color(0xFF4B5D52)
val DarkOutlineStrong = Color(0xFF71877A)
val DarkInputBorder = Color(0xFF71877A)

val DarkOnBackground = Color(0xFFF4F7F5) // 17.6:1 PASS
val DarkOnSurface = Color(0xFFF4F7F5)    // 15.6:1 PASS
val DarkOnPrimary = Color(0xFF032318)
val DarkOnAccent = Color(0xFF241000)
val DarkOnSurfaceSecondary = Color(0xFFD0DBD3)
val DarkOnSurfaceVariant = Color(0xFFAAB5AE)
val DarkOnSurfaceTertiary = Color(0xFF78857D)
val DarkTextDisabled = Color(0xFF556158)
val DarkOnSuccess = Color(0xFF032318)
val DarkOnWarning = Color(0xFF241000)
val DarkOnError = Color(0xFF2A0808)
val DarkOnInfo = Color(0xFF071A35)
val DarkSelection = Color(0xFF1A7A4C)
val DarkScrim = Color(0xFF000000)

// Semantic dark
val DarkSuccess = Color(0xFF4ADE80)
val DarkWarning = Color(0xFFFBBF24)
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
