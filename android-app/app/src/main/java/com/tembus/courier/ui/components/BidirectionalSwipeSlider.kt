package com.tembus.courier.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.*
import com.tembus.courier.ui.localization.CourierText as Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

@Composable
fun BidirectionalSwipeSlider(
    onAccept: () -> Unit,
    onReject: () -> Unit,
    modifier: Modifier = Modifier
) {
    var containerWidth by remember { mutableStateOf(0f) }
    val density = LocalDensity.current
    val thumbSize = 64.dp
    val thumbSizePx = with(density) { thumbSize.toPx() }
    
    // Offset for the thumb
    val offsetX = remember { Animatable(0f) }
    val coroutineScope = rememberCoroutineScope()

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(72.dp)
            .clip(RoundedCornerShape(36.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .onGloballyPositioned { coordinates ->
                containerWidth = coordinates.size.width.toFloat()
            },
        contentAlignment = Alignment.Center
    ) {
        // Background track texts
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.ChevronLeft, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                Spacer(modifier = Modifier.width(4.dp))
                Text("Tolak", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
            }
            
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Terima", color = Color(0xFF4CAF50), fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.width(4.dp))
                Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Color(0xFF4CAF50))
            }
        }

        // Draggable Thumb
        Box(
            modifier = Modifier
                .offset { IntOffset(offsetX.value.roundToInt(), 0) }
                .size(thumbSize)
                .clip(RoundedCornerShape(32.dp))
                .background(MaterialTheme.colorScheme.primary)
                .pointerInput(Unit) {
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            coroutineScope.launch {
                                if (containerWidth > 0) {
                                    val threshold = (containerWidth / 2f - thumbSizePx / 2f) * 0.7f
                                    if (offsetX.value > threshold) {
                                        // Accept triggered!
                                        offsetX.animateTo(containerWidth / 2f - thumbSizePx / 2f)
                                        onAccept()
                                    } else if (offsetX.value < -threshold) {
                                        // Reject triggered!
                                        offsetX.animateTo(-(containerWidth / 2f - thumbSizePx / 2f))
                                        onReject()
                                    } else {
                                        // Spring back
                                        offsetX.animateTo(0f, animationSpec = tween(300))
                                    }
                                } else {
                                    offsetX.animateTo(0f)
                                }
                            }
                        }
                    ) { change, dragAmount ->
                        change.consume()
                        coroutineScope.launch {
                            val maxLimit = containerWidth / 2f - thumbSizePx / 2f
                            val newOffset = (offsetX.value + dragAmount).coerceIn(-maxLimit, maxLimit)
                            offsetX.snapTo(newOffset)
                        }
                    }
                },
            contentAlignment = Alignment.Center
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                Icon(Icons.Default.ChevronLeft, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary)
                Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary)
            }
        }
    }
}
