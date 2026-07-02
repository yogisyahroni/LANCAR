package com.tembus.courier.ui.screens.sos

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import android.content.Context
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

@Composable
fun SosSwipeButton(
    modifier: Modifier = Modifier,
    onSosTriggered: () -> Unit
) {
    var isTriggered by remember { mutableStateOf(false) }
    val maxDrag = with(LocalDensity.current) { 250.dp.toPx() } // Approx width minus thumb
    val dragOffset = remember { Animatable(0f) }
    val coroutineScope = rememberCoroutineScope()
    val context = LocalContext.current

    Box(
        modifier = modifier
            .width(320.dp)
            .height(64.dp)
            .clip(RoundedCornerShape(32.dp))
            .background(Color.Red.copy(alpha = 0.2f)),
        contentAlignment = Alignment.CenterStart
    ) {
        // Background Text
        Text(
            text = if (isTriggered) "SOS TERKIRIM" else "GESER UNTUK SOS >>",
            color = if (isTriggered) Color.Red else Color.Red.copy(alpha = 0.7f),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.align(Alignment.Center)
        )

        // Draggable Thumb
        Box(
            modifier = Modifier
                .offset { IntOffset(dragOffset.value.roundToInt(), 0) }
                .size(64.dp)
                .padding(4.dp)
                .clip(CircleShape)
                .background(Color.Red)
                .draggable(
                    orientation = Orientation.Horizontal,
                    state = rememberDraggableState { delta ->
                        if (!isTriggered) {
                            coroutineScope.launch {
                                val newOffset = (dragOffset.value + delta).coerceIn(0f, maxDrag)
                                dragOffset.snapTo(newOffset)
                            }
                        }
                    },
                    onDragStopped = {
                        if (!isTriggered) {
                            coroutineScope.launch {
                                if (dragOffset.value >= maxDrag * 0.9f) {
                                    // Trigger SOS
                                    dragOffset.animateTo(maxDrag)
                                    isTriggered = true
                                    
                                    val prefs = context.getSharedPreferences("sos_prefs", Context.MODE_PRIVATE)
                                    prefs.edit().putBoolean("is_sos_active", true).apply()
                                    
                                    onSosTriggered()
                                } else {
                                    // Snap back
                                    dragOffset.animateTo(0f)
                                }
                            }
                        }
                    }
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = "SOS Icon",
                tint = Color.White
            )
        }
    }
}
