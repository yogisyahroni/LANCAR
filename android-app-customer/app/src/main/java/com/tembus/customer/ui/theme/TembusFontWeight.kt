package com.tembus.customer.ui.theme

import androidx.compose.ui.text.font.FontWeight

/**
 * TEMBUS Font Weight Tokens — Single source of truth for font weights.
 *
 * Stop mixing FontWeight.Bold / ExtraBold / Black across screens.
 * Use these tokens so weight changes propagate everywhere.
 *
 * Convention:
 *   display  → Bold (700)   — hero numbers, big headlines
 *   headline → SemiBold (600) — section titles
 *   title    → Bold (700)    — card titles, app bar
 *   body     → Normal (400)  — paragraphs, descriptions
 *   emphasis → SemiBold (600) — medium-emphasis text
 *   strong   → ExtraBold (800) — CTAs, prominent numbers
 *   heavy    → Black (900)   — ultra-prominent, badges, count
 *   label    → Medium (500)  — buttons, chips, small labels
 */
object TembusFontWeight {
    val display = FontWeight.Bold
    val headline = FontWeight.SemiBold
    val title = FontWeight.Bold
    val body = FontWeight.Normal
    val bodyEmphasis = FontWeight.Medium
    val emphasis = FontWeight.SemiBold
    val strong = FontWeight.ExtraBold
    val heavy = FontWeight.Black
    val label = FontWeight.Medium
    val labelBold = FontWeight.Bold
}
