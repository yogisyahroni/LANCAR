package com.tembus.courier.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.TwoWheeler
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.displayServiceName
import com.tembus.courier.data.model.isMaintenanceService
import com.tembus.courier.ui.theme.Accent
import com.tembus.courier.ui.theme.Primary
import com.tembus.courier.ui.theme.PrimarySoft
import com.tembus.courier.ui.theme.TembusComponentDefaults
import com.tembus.courier.ui.theme.TembusSpacing

/**
 * Stitch-aligned conversation inbox for the persistent Pesan tab.
 *
 * Conversation entries are derived from the same order snapshot used by the
 * activity screen; opening an item always enters the existing server-backed
 * ChatScreen, so this tab never creates a parallel message source of truth.
 */
@Composable
internal fun CourierMessagesScreen(
    orders: List<Order>,
    onOpenChat: (Order) -> Unit
) {
    val conversations = orders
        .filter { it.orderId.isNotBlank() }
        .sortedByDescending { it.updatedAt }
        .take(20)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        CourierPageHeader(
            title = "Pesan",
            subtitle = "Koordinasi pelanggan dan operasional"
        )

        Surface(
            modifier = Modifier.padding(horizontal = TembusSpacing.Screen, vertical = TembusSpacing.Medium),
            color = PrimarySoft.copy(alpha = 0.72f),
            shape = RoundedCornerShape(16.dp)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Icon(Icons.Default.ChatBubble, contentDescription = null, tint = Primary)
                Column(modifier = Modifier.weight(1f)) {
                    Text("Ruang koordinasi aman", fontWeight = FontWeight.Bold, color = Primary)
                    Text(
                        "Pesan order, lokasi, dan bukti kerja tersimpan di satu alur.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        if (conversations.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.AutoMirrored.Filled.Message,
                        contentDescription = null,
                        tint = Primary.copy(alpha = 0.45f),
                        modifier = Modifier.size(42.dp)
                    )
                    Spacer(Modifier.size(12.dp))
                    Text("Belum ada percakapan", fontWeight = FontWeight.Bold)
                    Text(
                        "Percakapan akan muncul saat ada order aktif.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = TembusSpacing.Screen, vertical = TembusSpacing.Small),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(conversations, key = { it.orderId }) { order ->
                    CourierConversationRow(order = order, onClick = { onOpenChat(order) })
                }
            }
        }
    }
}

@Composable
private fun CourierConversationRow(order: Order, onClick: () -> Unit) {
    val name = order.customerName.ifBlank { "Pelanggan TEMBUS" }
    val initials = name.trim().split(" ").take(2).joinToString("") { it.firstOrNull()?.uppercase() ?: "" }
    val service = order.displayServiceName().ifBlank { "Order On-Demand" }
    val status = order.status.replace('_', ' ').lowercase().replaceFirstChar { it.uppercase() }
    val accent = if (order.isMaintenanceService()) Accent else Primary

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.surface,
        shape = TembusComponentDefaults.cardShape(),
        tonalElevation = 1.dp
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(accent.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(serviceIcon(order), contentDescription = null, tint = accent, modifier = Modifier.size(22.dp))
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(name, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(initials, color = accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
                Text(service, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                Text(
                    "${order.pickupAddress.ifBlank { "Lokasi order tersinkron" }} • $status",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "Buka percakapan", tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun serviceIcon(order: Order) = when {
    order.serviceCode?.contains("towing", ignoreCase = true) == true -> Icons.Default.LocalShipping
    order.serviceCode?.contains("tambal", ignoreCase = true) == true -> Icons.Default.Build
    order.serviceCode?.contains("food", ignoreCase = true) == true -> Icons.Default.Restaurant
    order.serviceCode?.contains("bike", ignoreCase = true) == true -> Icons.Default.TwoWheeler
    else -> Icons.AutoMirrored.Filled.Message
}
