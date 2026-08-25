package com.tembus.courier.ui.screens.order

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.GpsFixed
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import com.tembus.courier.ui.theme.AccentDark
import com.tembus.courier.ui.theme.Primary
import com.tembus.courier.ui.theme.Success

// Extracted from OrderDetailScreen.kt (god-file refactor): reusable leaf components + theme colors.

internal val LogisticsOrange = AccentDark // #C2410C — CTA/ikon oranye dgn teks putih 5.18:1 (WCAG AA)
internal val DeepForest = Color(0xFF0A2F20)
internal val OnDemandSurface = Color(0xFFF2F5F0)

@Composable
internal fun InfoRow(label: String, value: String, valueColor: Color = Color.Unspecified) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(0.42f)
        )
        Text(
            text = value.ifBlank { "Data sedang disinkronkan" },
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = if (valueColor == Color.Unspecified) MaterialTheme.colorScheme.onSurface else valueColor,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(0.58f)
        )
    }
    Spacer(modifier = Modifier.height(8.dp))
}

/** Potong UUID jadi 8 karakter pertama untuk tampilan kompak: f779a9c4… */
internal fun shortOrderId(orderId: String): String =
    orderId.take(8).ifBlank { orderId }

/** Format angka ke rupiah tanpa desimal: 10000 → "10.000". */
internal fun formatRp(value: Long): String {
    val s = value.toString()
    return s.reversed().chunked(3).joinToString(".").reversed()
}

@Composable
internal fun StepPill(label: String, active: Boolean, done: Boolean, modifier: Modifier = Modifier) {
    val color = when {
        done -> Success
        active -> LogisticsOrange
        else -> Color.White
    }
    Surface(
        modifier = modifier,
        color = color,
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.32f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = if (done) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                contentDescription = null,
                tint = if (done || active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(14.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(label, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium, color = if (done || active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
internal fun VerificationNotice(text: String) {
    Surface(
        color = Color.White.copy(alpha = 0.74f),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, LogisticsOrange.copy(alpha = 0.45f))
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(10.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Default.GpsFixed, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.size(18.dp))
            Text(text, style = MaterialTheme.typography.bodySmall, color = DeepForest)
        }
    }
}

@Composable
internal fun CompactActionButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    strong: Boolean = false
) {
    // strong = tombol utama hijau: pakai Primary (#005C32, putih 8.15:1 PASS)
    // bukan DeepForest (#0A2F20) yang nyaris menyatu dgn bg gelap (vision 5/10).
    val container = if (strong) Primary else Color.White
    val content = if (strong) Color.White else DeepForest
    Button(
        onClick = onClick,
        modifier = modifier.height(52.dp),
        shape = RoundedCornerShape(8.dp),
        colors = ButtonDefaults.buttonColors(containerColor = container, contentColor = content),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.28f)),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp)
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(modifier = Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
    }
}
