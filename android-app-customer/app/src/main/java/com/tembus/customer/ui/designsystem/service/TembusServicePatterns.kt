package com.tembus.customer.ui.designsystem.service

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tembus.customer.ui.designsystem.TembusBadge
import com.tembus.customer.ui.designsystem.TembusBadgeTone
import com.tembus.customer.ui.designsystem.TembusCard
import com.tembus.customer.ui.designsystem.TembusEmptyState

/**
 * Shared identity and state language for non-Food service verticals.
 * Vertical identity is data (icon, title, priority), not a separate mini-brand.
 */
data class TembusServiceIdentity(
    val title: String,
    val subtitle: String,
    val priorityLabel: String,
    val icon: ImageVector,
    val tone: TembusBadgeTone = TembusBadgeTone.Info,
)

@Composable
fun TembusServiceIdentityCard(
    identity: TembusServiceIdentity,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
) {
    TembusCard(modifier = modifier.fillMaxWidth(), onClick = onClick) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                identity.icon,
                contentDescription = identity.title,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(28.dp),
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(identity.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(
                    identity.subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            TembusBadge(identity.priorityLabel, tone = identity.tone)
        }
    }
}

@Composable
fun TembusAdFreeServiceNotice(
    message: String,
    modifier: Modifier = Modifier,
) {
    TembusCard(modifier = modifier.fillMaxWidth(), elevated = true) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                Icons.Default.Security,
                contentDescription = "Alur layanan tanpa iklan",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(22.dp),
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Alur layanan tanpa iklan", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
fun TembusServiceEmptyState(
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,
) {
    TembusEmptyState(
        title = title,
        message = message,
        modifier = modifier,
        icon = Icons.Default.Build,
        actionLabel = if (onRetry != null) "Coba lagi" else null,
        onAction = onRetry,
    )
}

val TembusParcelIdentity = TembusServiceIdentity(
    title = "Antar Barang",
    subtitle = "Rute, detail paket, pilihan carrier, dan quote server sebelum konfirmasi.",
    priorityLabel = "Rute + paket",
    icon = Icons.Default.LocalShipping,
)

val TembusTireRepairIdentity = TembusServiceIdentity(
    title = "Tambal Ban",
    subtitle = "Lokasi masalah, kapabilitas teknisi, dan ETA untuk jalur bantuan terpendek.",
    priorityLabel = "Darurat",
    icon = Icons.Default.Build,
    tone = TembusBadgeTone.Warning,
)

val TembusTowingIdentity = TembusServiceIdentity(
    title = "Towing / Derek",
    subtitle = "Keselamatan, kecocokan kendaraan, tujuan, inspeksi, dan rute sebelum berangkat.",
    priorityLabel = "Safety first",
    icon = Icons.Default.Security,
    tone = TembusBadgeTone.Warning,
)
