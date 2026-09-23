package com.tembus.customer.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tembus.customer.ui.theme.RadarPulseGreen

/**
 * Shared radar indicator for active provider/technician discovery.
 * The animation is intentionally visual-only; matching remains server-authoritative.
 */
@Composable
internal fun RadarPulseIndicator(
    active: Boolean,
    modifier: Modifier = Modifier,
    size: Dp = 16.dp,
    dotSize: Dp = 7.dp,
) {
    if (!active) {
        Box(
            modifier = modifier
                .size(dotSize)
                .background(RadarPulseGreen, CircleShape),
        )
        return
    }

    val transition = rememberInfiniteTransition(label = "radar-pulse")
    val progress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1400), RepeatMode.Restart),
        label = "radar-pulse-progress",
    )
    val ringSize = dotSize + ((size - dotSize) * progress)

    Box(
        modifier = modifier.size(size),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(ringSize)
                .background(
                    RadarPulseGreen.copy(alpha = (1f - progress) * .55f),
                    CircleShape,
                ),
        )
        Box(
            modifier = Modifier
                .size(dotSize)
                .background(RadarPulseGreen, CircleShape),
        )
    }
}
