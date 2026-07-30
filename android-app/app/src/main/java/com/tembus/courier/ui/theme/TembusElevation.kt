package com.tembus.courier.ui.theme

import androidx.compose.ui.unit.dp

/**
 * TEMBUS Elevation Tokens — Consistent shadow depth across the app.
 *
 * Prevents arbitrary 1.dp / 2.dp / 4.dp / 12.dp elevations.
 *
 * Levels:
 *   none      = 0.dp  — flat surfaces
 *   card      = 1.dp  — rest state cards
 *   cardHover = 2.dp  — elevated / pressed card
 *   fab       = 6.dp  — FAB, sticky elements
 *   modal     = 8.dp  — bottom sheets, menus
 *   dialog    = 12.dp — dialogs, full-screen overlays
 */
object TembusElevation {
    val none = 0.dp
    val card = 1.dp
    val cardHover = 2.dp
    val fab = 6.dp
    val bottomNav = 8.dp
    val modal = 8.dp
    val dialog = 12.dp
}
