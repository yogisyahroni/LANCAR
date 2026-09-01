package com.tembus.customer.ui.a11y

import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics

/** Explicit labels for critical actions that otherwise contain only icons or dynamic text. */
fun Modifier.criticalAction(label: String): Modifier = composed {
    val haptic = LocalHapticFeedback.current
    this
        // Observe release without consuming it, so Material Button/Clickable
        // keeps ownership of the actual action and TalkBack remains intact.
        .pointerInput(label) {
            awaitPointerEventScope {
                while (true) {
                    val event = awaitPointerEvent()
                    if (event.type == PointerEventType.Release) {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    }
                }
            }
        }
        .semantics {
            contentDescription = label
            role = Role.Button
        }
}
