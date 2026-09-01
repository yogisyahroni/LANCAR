package com.tembus.merchant.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback

/** Adds consistent tactile confirmation without changing the action callback. */
@Composable
fun rememberMerchantHapticAction(onClick: () -> Unit): () -> Unit {
    val haptic = LocalHapticFeedback.current
    val latestOnClick by rememberUpdatedState(onClick)
    return remember(haptic) {
        {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            latestOnClick()
        }
    }
}
