package com.tembus.customer.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ============================================================
// SERVICE PROGRESS BAR — For Tambal Ban & Towing
// ============================================================

@Composable
fun ServiceProgressBar(
    steps: List<String>,
    currentStep: Int, // 0-indexed
    modifier: Modifier = Modifier
) {
    if (steps.isEmpty()) return

    val safeCurrentStep = currentStep.coerceIn(0, steps.lastIndex)
    val primaryColor = MaterialTheme.colorScheme.primary
    val primaryContainerColor = MaterialTheme.colorScheme.primaryContainer
    val surfaceVariantColor = MaterialTheme.colorScheme.surfaceVariant
    val onSurfaceVariantColor = MaterialTheme.colorScheme.onSurfaceVariant

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        // Keep the markers in a fixed-height row. Labels are rendered below in
        // a separate equal-width row, so wrapping a long label can never move
        // a marker or bend the connector line.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(24.dp),
        ) {
            Canvas(modifier = Modifier.matchParentSize()) {
                val slotWidth = size.width / steps.size
                val markerDiameter = 24.dp.toPx()
                val connectorY = size.height / 2f
                for (index in 0 until steps.lastIndex) {
                    val startX = slotWidth * (index + 0.5f) + markerDiameter / 2f
                    val endX = slotWidth * (index + 1.5f) - markerDiameter / 2f
                    drawLine(
                        color = if (index < safeCurrentStep) primaryColor else surfaceVariantColor,
                        start = androidx.compose.ui.geometry.Offset(startX, connectorY),
                        end = androidx.compose.ui.geometry.Offset(endX, connectorY),
                        strokeWidth = 2.dp.toPx(),
                    )
                }
            }
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                steps.forEachIndexed { index, _ ->
                    val isCompleted = index < safeCurrentStep
                    val isCurrent = index == safeCurrentStep
                    Box(
                        modifier = Modifier.weight(1f),
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(24.dp)
                                .clip(CircleShape)
                                .background(
                                    when {
                                        isCompleted -> primaryColor
                                        isCurrent -> primaryContainerColor
                                        else -> surfaceVariantColor
                                    }
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                "${index + 1}",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = when {
                                    isCompleted -> Color.White
                                    isCurrent -> primaryColor
                                    else -> onSurfaceVariantColor
                                },
                            )
                        }
                    }
                }
            }
        }

        Row(modifier = Modifier.fillMaxWidth()) {
            steps.forEachIndexed { index, step ->
                val isCompleted = index < safeCurrentStep
                val isCurrent = index == safeCurrentStep
                Text(
                    text = step,
                    fontSize = 9.sp,
                    color = when {
                        isCompleted || isCurrent -> primaryColor
                        else -> onSurfaceVariantColor
                    },
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 32.dp)
                        .padding(horizontal = 2.dp, vertical = 4.dp),
                )
            }
        }
    }
}

// ============================================================
// TAMBAL BAN PROGRESS STEPS
// ============================================================

object TambalBanProgressSteps {
    val steps = listOf(
        "Menuju Anda",
        "Tiba",
        "Inspeksi",
        "Pengerjaan",
        "Selesai"
    )
}

// ============================================================
// TOWING CUSTOMER-FACING PROGRESS STEPS
// Operational events such as verification and inspection remain available in
// the server timeline/report; the primary mobile timeline uses six readable
// milestones so labels do not wrap into an eight-column squeeze.
// ============================================================

object TowingProgressSteps {
    val steps = listOf(
        "Menuju lokasi",
        "Verifikasi kendaraan",
        "Evakuasi kendaraan",
        "Perjalanan ke tujuan",
        "Tiba & menurunkan",
        "Selesai"
    )
}
