package com.tembus.courier.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.PauseCircle
import androidx.compose.material.icons.filled.Radar
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tembus.courier.data.model.CourierHotspot
import com.tembus.courier.data.model.CourierServiceProduct
import com.tembus.courier.ui.theme.Accent
import com.tembus.courier.ui.theme.AccentSoft
import com.tembus.courier.ui.theme.Primary
import com.tembus.courier.ui.theme.PrimaryDark
import com.tembus.courier.ui.theme.PrimarySoft
import com.tembus.courier.ui.theme.Success
import com.tembus.courier.ui.theme.TembusComponentDefaults

/**
 * Standby cockpit for the home/working tab.
 *
 * This is intentionally separate from the offer and active-job cards: standby
 * is a waiting state, while offer acceptance and navigation have different
 * actions and should not inherit the standby CTA hierarchy.
 */
@Composable
internal fun CourierStandbyRadarCockpit(
    modifier: Modifier = Modifier,
    isOnline: Boolean,
    activeServices: List<CourierServiceProduct>,
    hotspots: List<CourierHotspot>,
    onDutyToggle: (Boolean) -> Unit,
    onViewOrders: () -> Unit
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 260.dp, max = 500.dp),
        color = Color.White.copy(alpha = 0.98f),
        shape = RoundedCornerShape(26.dp),
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.12f)),
        shadowElevation = 12.dp
    ) {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = if (isOnline) PrimarySoft else MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(18.dp),
                border = BorderStroke(1.dp, if (isOnline) Success.copy(alpha = 0.18f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.22f))
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    StandbyRadarPulse(
                        enabled = isOnline,
                        modifier = Modifier.size(58.dp)
                    )
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(
                            text = if (isOnline) "Radar Siaga Aktif" else "Radar Siaga Dijeda",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Black,
                            color = PrimaryDark
                        )
                        Text(
                            text = if (isOnline) {
                                "Memindai order instan di sekitar kamu. Tawaran akan muncul otomatis."
                            } else {
                                "Aktifkan mode kerja untuk mulai menerima tawaran order."
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            val hotspot = hotspots.firstOrNull()
            if (hotspot != null) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = AccentSoft,
                    shape = RoundedCornerShape(18.dp),
                    border = BorderStroke(1.dp, Accent.copy(alpha = 0.18f))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Surface(color = Color.White.copy(alpha = 0.78f), shape = CircleShape) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.TrendingUp,
                                contentDescription = null,
                                tint = Accent,
                                modifier = Modifier.padding(8.dp).size(20.dp)
                            )
                        }
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = "Peluang order di ${hotspot.name}",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Black,
                                color = PrimaryDark,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                text = "${hotspot.pendingOrders.coerceAtLeast(0)} order terpantau · prioritas area aktif",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            Text(
                text = "LAYANAN SIAGA BEROPERASI",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Black,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            if (activeServices.isEmpty()) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Text(
                        text = "Layanan sedang disinkronkan dari profil operasional.",
                        modifier = Modifier.padding(14.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                activeServices.take(4).chunked(2).forEach { rowServices ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        rowServices.forEach { service ->
                            StandbyServiceChip(
                                service = service,
                                modifier = Modifier.weight(1f)
                            )
                        }
                        if (rowServices.size == 1) Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = { onDutyToggle(!isOnline) },
                    modifier = Modifier.weight(1f).height(48.dp),
                    shape = TembusComponentDefaults.buttonShape(),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                    contentPadding = ButtonDefaults.ContentPadding
                ) {
                    Icon(Icons.Default.PauseCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(if (isOnline) "Jeda kerja" else "Aktifkan kerja", fontWeight = FontWeight.Bold)
                }
                Button(
                    onClick = onViewOrders,
                    modifier = Modifier.weight(1f).height(48.dp),
                    shape = TembusComponentDefaults.buttonShape(),
                    colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Color.White)
                ) {
                    Icon(Icons.Default.Map, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Peta order", fontWeight = FontWeight.Black)
                    Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(16.dp))
                }
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = PrimaryDark,
                shape = RoundedCornerShape(18.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Surface(color = Color.White.copy(alpha = 0.14f), shape = CircleShape) {
                        Icon(
                            imageVector = if (isOnline) Icons.Default.Radar else Icons.Default.PauseCircle,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.padding(8.dp).size(20.dp)
                        )
                    }
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Mode Kerja Siaga", color = Color.White, fontWeight = FontWeight.Black)
                        Text(
                            if (isOnline) "Menunggu pesanan masuk" else "Mode kerja sedang dijeda",
                            color = Color.White.copy(alpha = 0.78f),
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                    Text(
                        if (isOnline) "AKTIF" else "JEDA",
                        color = if (isOnline) Color(0xFF9BE7B4) else Color.White.copy(alpha = 0.72f),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Black
                    )
                }
            }
        }
    }
}

@Composable
private fun StandbyServiceChip(
    service: CourierServiceProduct,
    modifier: Modifier = Modifier
) {
    val normalizedCode = service.code.lowercase()
    val icon = when {
        normalizedCode.contains("food") -> Icons.Default.Restaurant
        normalizedCode.contains("tambal") || normalizedCode.contains("tire") -> Icons.Default.Build
        normalizedCode.contains("towing") -> Icons.Default.DirectionsCar
        else -> Icons.Default.LocalShipping
    }
    Surface(
        modifier = modifier,
        color = PrimarySoft.copy(alpha = 0.72f),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.10f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            Icon(icon, contentDescription = null, tint = Primary, modifier = Modifier.size(18.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(
                    service.name.ifBlank { service.code },
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = PrimaryDark,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    "Aktif",
                    style = MaterialTheme.typography.labelSmall,
                    color = Success,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun StandbyRadarPulse(
    enabled: Boolean,
    modifier: Modifier = Modifier
) {
    val transition = rememberInfiniteTransition(label = "standby-radar")
    val progress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2200),
            repeatMode = RepeatMode.Restart
        ),
        label = "standby-radar-progress"
    )
    val pulseColor = if (enabled) Success else MaterialTheme.colorScheme.outline

    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.matchParentSize()) {
            val center = androidx.compose.ui.geometry.Offset(size.width / 2f, size.height / 2f)
            val maxRadius = size.minDimension / 2f
            if (enabled) {
                listOf(0f, 0.28f, 0.56f).forEach { offset ->
                    val ringProgress = (progress + offset) % 1f
                    drawCircle(
                        color = pulseColor.copy(alpha = (1f - ringProgress) * 0.34f),
                        radius = maxRadius * (0.30f + ringProgress * 0.62f),
                        center = center,
                        style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round)
                    )
                }
            } else {
                drawCircle(
                    color = pulseColor.copy(alpha = 0.24f),
                    radius = maxRadius * 0.72f,
                    center = center,
                    style = Stroke(width = 2.dp.toPx())
                )
            }
        }
        Surface(
            modifier = Modifier.size(18.dp),
            color = pulseColor,
            shape = CircleShape
        ) {}
    }
}
