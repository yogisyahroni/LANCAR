package com.tembus.courier.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tembus.courier.data.model.toRupiahCompact
import com.tembus.courier.ui.theme.TembusComponentDefaults
import com.tembus.courier.ui.theme.TembusSpacing
import com.tembus.courier.ui.theme.PrimaryDark
import com.tembus.courier.ui.theme.PrimarySoft
import com.tembus.courier.ui.theme.Accent

/** Small, shared surfaces for the courier redesign. Logic stays in the existing screens. */
@Composable
internal fun CourierPageHeader(
    title: String,
    subtitle: String? = null,
    trailing: (@Composable () -> Unit)? = null
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(TembusSpacing.XSmall)) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Black,
                color = MaterialTheme.colorScheme.onSurface
            )
            subtitle?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        trailing?.invoke()
    }
}

@Composable
internal fun CourierSurfaceCard(
    modifier: Modifier = Modifier,
    containerColor: Color = MaterialTheme.colorScheme.surface,
    content: @Composable () -> Unit
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = TembusComponentDefaults.cardShape(),
        color = containerColor,
        tonalElevation = 1.dp,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.36f))
    ) {
        content()
    }
}

@Composable
internal fun CourierInfoBanner(
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    icon: @Composable () -> Unit = {
        Icon(Icons.Default.Info, contentDescription = null)
    }
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.62f),
        contentColor = MaterialTheme.colorScheme.onPrimaryContainer
    ) {
        Row(
            modifier = Modifier.padding(TembusSpacing.Large),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(TembusSpacing.Medium)
        ) {
            icon()
            Column(verticalArrangement = Arrangement.spacedBy(TembusSpacing.XSmall)) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(message, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

/** Compact earnings anchor from the Stitch courier home and standby screens. */
@Composable
internal fun StitchCourierEarningsStrip(
    modifier: Modifier = Modifier,
    courierName: String,
    todayEarningsIdr: Int,
    orderCount: Int
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = Color.White.copy(alpha = 0.96f),
        shape = RoundedCornerShape(20.dp),
        tonalElevation = 2.dp,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.28f))
    ) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        "PENDAPATAN HARI INI",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        todayEarningsIdr.toRupiahCompact(),
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Black,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer,
                    shape = RoundedCornerShape(999.dp)
                ) {
                    Text(
                        "${orderCount.coerceAtLeast(0)} order",
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }
            Text(
                "${courierName.ifBlank { "Mitra TEMBUS" }} • saldo diperbarui real-time",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
internal fun StitchServiceJobHero(
    serviceName: String,
    orderNumber: String,
    customerName: String,
    address: String,
    isTowing: Boolean
) {
    val serviceAccent = if (isTowing) Accent else MaterialTheme.colorScheme.primary
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = PrimaryDark,
        shape = RoundedCornerShape(22.dp)
    ) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(
                        if (isTowing) Icons.Default.LocalShipping else Icons.Default.Build,
                        contentDescription = null,
                        tint = serviceAccent,
                        modifier = Modifier.size(20.dp)
                    )
                    Text("${serviceName.uppercase()} SIAGA", color = Color.White, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Black)
                }
                Surface(color = PrimarySoft.copy(alpha = 0.28f), shape = RoundedCornerShape(999.dp)) {
                    Text("LIVE", modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), color = Color.White, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Black)
                }
            }
            Text("Eksekusi $serviceName", color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Black)
            Text(
                "${customerName.ifBlank { "Pelanggan TEMBUS" }} • $orderNumber",
                color = Color.White.copy(alpha = 0.78f),
                style = MaterialTheme.typography.bodySmall
            )
            Surface(color = Color.White.copy(alpha = 0.10f), shape = RoundedCornerShape(14.dp)) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = serviceAccent, modifier = Modifier.size(20.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("LOKASI LAYANAN", color = Color.White.copy(alpha = 0.64f), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        Text(address.ifBlank { "Alamat layanan sedang disinkronkan" }, color = Color.White, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, maxLines = 2)
                    }
                    Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = Color.White.copy(alpha = 0.72f), modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}
