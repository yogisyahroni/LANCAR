package com.tembus.customer.ui

import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag

/**
 * Accessibility helpers for TalkBack / screen-reader support on critical
 * customer flows (booking, tracking, payment, order detail).
 *
 * These are thin wrappers over Compose semantics — no behavior change, only
 * expose meaningful content descriptions and test tags for automation.
 */

/** Attach a human-readable content description for screen readers. */
fun Modifier.accessible(description: String): Modifier =
    this.semantics(mergeDescendants = false) {
        contentDescription = description
    }

/** Attach a stable test tag (also announced as part of the semantics tree). */
fun Modifier.withTestTag(tag: String): Modifier =
    this.semantics(mergeDescendants = false) {
        testTag = tag
    }

/** Combine a content description for TalkBack with a test tag for automation. */
fun Modifier.accessibleAction(
    description: String,
    tag: String? = null,
): Modifier = this.semantics(mergeDescendants = false) {
    contentDescription = description
    if (tag != null) testTag = tag
}
