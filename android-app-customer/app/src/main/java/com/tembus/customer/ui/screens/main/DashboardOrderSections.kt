package com.tembus.customer.ui.screens.main

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.data.model.Order
import com.tembus.customer.ui.designsystem.TembusBadge
import com.tembus.customer.ui.designsystem.TembusBadgeTone
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.Error
import com.tembus.customer.ui.theme.OnOrangeCta
import com.tembus.customer.ui.theme.OrangeCta
import com.tembus.customer.ui.theme.Success
import com.tembus.customer.ui.theme.TembusRadius

internal fun humanOrderStatus(statusLower: String): String = when (statusLower) {    "pending", "created", "waiting", "waiting_for_driver", "searching_driver" -> "Menunggu kurir"
    "assigned", "accepted" -> "Kurir ditugaskan"
    "picking_up" -> "Kurir menuju pickup"
    "picked_up", "in_transit", "delivering" -> "Dalam perjalanan"
    "delivered", "completed", "arrived" -> "Selesai"
    "cancelled", "canceled" -> "Dibatalkan"
    "failed", "payment_failed", "rejected" -> "Gagal"
    else -> statusLower.replace("_", " ").replaceFirstChar { it.uppercase() }
}

// DESIGN.md §11.5/§12: progres mini + tone chip status kartu order aktif.
internal fun activeOrderProgress(statusLower: String): Float = when (statusLower) {
    "pending", "created", "waiting", "waiting_for_driver", "searching_driver", "searching" -> 0.15f
    "assigned", "accepted" -> 0.35f
    "picking_up" -> 0.55f
    "picked_up", "in_transit", "delivering" -> 0.8f
    "delivered", "completed", "arrived" -> 1f
    else -> 0.15f
}

internal fun activeOrderBadgeTone(statusLower: String): TembusBadgeTone = when (statusLower) {
    "delivered", "completed", "arrived" -> TembusBadgeTone.Success
    "cancelled", "canceled", "failed", "payment_failed", "rejected" -> TembusBadgeTone.Error
    "pending", "created", "waiting", "waiting_for_driver", "searching_driver", "searching" -> TembusBadgeTone.Warning
    else -> TembusBadgeTone.Info
}

@Composable
internal fun UnreadDot(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(9.dp)
            .clip(CircleShape)
            .background(Accent)
    )
}

@Composable
internal fun CompactActiveOrdersSummaryCard(
    orders: List<Order>,
    hasUnreadMessage: Boolean,
    onTrackingClick: (String) -> Unit,
    onViewAllClick: () -> Unit,
) {
    if (orders.isEmpty()) return
    val primaryOrder = orders.first()
    val orderCount = orders.size
    val destination = primaryOrder.dropAddress.ifBlank {
        primaryOrder.pickupAddress.ifBlank { "Pesanan ${primaryOrder.orderNumber.ifBlank { primaryOrder.orderId }}" }
    }
    val statusHuman = humanOrderStatus(primaryOrder.status.lowercase())
    val statusPill = when (primaryOrder.status.lowercase()) {
        "assigned", "accepted", "picking_up", "searching_driver" -> "Kurir Menuju Lokasi"
        else -> statusHuman
    }
    val serviceLabel = when {
        primaryOrder.serviceCategory.orEmpty().contains("food", ignoreCase = true) -> "Food Delivery"
        primaryOrder.serviceCategory.orEmpty().contains("towing", ignoreCase = true) -> "Towing"
        else -> "Kirim Instant"
    }
    val orderRef = primaryOrder.orderNumber.ifBlank { primaryOrder.orderId.take(8) }
    val courier = primaryOrder.courierName?.takeIf { it.isNotBlank() } ?: "Kurir TEMBUS"
    val vehicle = primaryOrder.courierVehicle?.takeIf { it.isNotBlank() }
    val distance = primaryOrder.distance.takeIf { it.isNotBlank() }
    val eta = primaryOrder.etaMinutes?.takeIf { it > 0 }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clickable {
                if (orderCount == 1) onTrackingClick(primaryOrder.orderId) else onViewAllClick()
            },
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, LcGreen.copy(alpha = 0.25f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(Modifier.padding(horizontal = 13.dp, vertical = 9.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("$serviceLabel  •  #$orderRef", fontSize = 9.sp, color = Muted, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Surface(color = Color(0xFFFFF0E7), shape = RoundedCornerShape(999.dp)) {
                    Text(statusPill, color = OrangeCta, fontSize = 8.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 7.dp, vertical = 4.dp))
                }
            }
            Spacer(Modifier.height(3.dp))
            Text(
                destination.substringBefore(",").trim().ifBlank { destination },
                fontSize = 14.sp,
                fontWeight = FontWeight.Black,
                color = Ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(7.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(27.dp).clip(CircleShape).background(SoftGreen), contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.LocalShipping, contentDescription = null, tint = LcGreen, modifier = Modifier.size(14.dp))
                }
                Spacer(Modifier.width(7.dp))
                Text(
                    buildString {
                        append(courier)
                        if (vehicle != null) append(" ($vehicle)")
                    },
                    color = Ink,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (eta != null) {
                    Text("$eta Menit", color = OrangeCta, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                }
                if (distance != null) {
                    Text(" (${distance})", color = OrangeCta, fontSize = 9.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                }
            }
            Spacer(Modifier.height(5.dp))
            LinearProgressIndicator(
                progress = { activeOrderProgress(primaryOrder.status.lowercase()) },
                modifier = Modifier.fillMaxWidth().height(4.dp).clip(CircleShape),
                color = OrangeCta,
                trackColor = Color(0xFFE4EEE9),
            )
            Spacer(Modifier.height(7.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (eta != null) "Tiba estimasi dalam $eta menit" else "Status diperbarui dari server",
                    color = Muted,
                    fontSize = 9.sp,
                    modifier = Modifier.weight(1f),
                )
                Button(
                    onClick = { if (orderCount == 1) onTrackingClick(primaryOrder.orderId) else onViewAllClick() },
                    shape = RoundedCornerShape(999.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OrangeCta, contentColor = OnOrangeCta),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 5.dp),
                    modifier = Modifier.height(28.dp),
                ) {
                    Text(if (orderCount > 1) "Semua ($orderCount)" else "Lacak Live", fontSize = 9.sp, fontWeight = FontWeight.Black)
                    Spacer(Modifier.width(3.dp))
                    Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(11.dp))
                }
            }
        }
    }
}

/**
 * Preserve the Home Figma order-context slot when the server has no active
 * order. This is intentionally an empty state: no order id, courier, ETA, or
 * dispatch status is synthesized just to fill the design frame.
 */
@Composable
internal fun EmptyActiveOrderCard(
    onBookingClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, LcGreen.copy(alpha = 0.25f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 13.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(SoftGreen),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Default.LocalShipping, contentDescription = null, tint = LcGreen, modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.width(9.dp))
            Column(Modifier.weight(1f)) {
                Text("Belum ada pesanan aktif", fontSize = 13.sp, fontWeight = FontWeight.Black, color = Ink)
                Text("Pesanan yang sedang berjalan akan muncul di sini.", fontSize = 9.sp, color = Muted, maxLines = 2)
            }
            Button(
                onClick = onBookingClick,
                shape = RoundedCornerShape(999.dp),
                colors = ButtonDefaults.buttonColors(containerColor = OrangeCta, contentColor = OnOrangeCta),
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 5.dp),
                modifier = Modifier.height(30.dp),
            ) {
                Text("Pesan", fontSize = 9.sp, fontWeight = FontWeight.Black)
            }
        }
    }
}

/**
 * Figma Customer Home's "Pesan Lagi Cepat" block. It is rendered only from a
 * terminal order returned by the server; it never invents a destination or
 * silently recreates an order. The action opens Activity so the customer can
 * review the authoritative order before starting another booking.
 */
@Composable
internal fun QuickRepeatOrderCard(
    order: Order,
    onOpenHistory: () -> Unit,
) {
    val title = when {
        order.merchantName?.isNotBlank() == true -> order.merchantName.orEmpty()
        order.dropAddress.isNotBlank() -> order.dropAddress.substringBefore(",").trim()
        else -> "Pesanan TEMBUS"
    }
    val detail = listOf(order.pickupAddress, order.dropAddress)
        .filter { it.isNotBlank() }
        .joinToString(" → ")
        .ifBlank { "Detail tersedia di Aktivitas" }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clickable(onClick = onOpenHistory),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, LcGreen.copy(alpha = 0.18f)),
    ) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Pesan Lagi Cepat", fontSize = 15.sp, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f))
                Text("Lihat Riwayat", color = OrangeCta, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(34.dp).clip(CircleShape).background(SoftGreen), contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Refresh, contentDescription = null, tint = LcGreen, modifier = Modifier.size(18.dp))
                }
                Spacer(Modifier.width(9.dp))
                Column(Modifier.weight(1f)) {
                    Text(title, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(detail, fontSize = 10.sp, color = Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "Buka Aktivitas", tint = OrangeCta, modifier = Modifier.size(18.dp))
            }
        }
    }
}

/**
 * Preserve the Home Figma hierarchy when the server has no terminal order for
 * this customer. The card is intentionally informational; it never invents
 * an order that could be mistaken for a repeatable business action.
 */
@Composable
internal fun QuickRepeatEmptyState(
    onOpenHistory: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clickable(onClick = onOpenHistory),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, Accent.copy(alpha = 0.18f)),
    ) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Pesan Lagi Cepat", fontSize = 15.sp, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f))
                Text("Lihat Riwayat", color = OrangeCta, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(34.dp).clip(CircleShape).background(Color(0xFFEAF6F0)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Refresh, contentDescription = null, tint = OrangeCta, modifier = Modifier.size(18.dp))
                }
                Spacer(Modifier.width(9.dp))
                Column(Modifier.weight(1f)) {
                    Text("Belum ada pesanan untuk diulang", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    Text("Pesanan selesai akan muncul di sini.", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "Buka Aktivitas", tint = OrangeCta, modifier = Modifier.size(18.dp))
            }
        }
    }
}

@Composable
internal fun ActiveOrdersSection(
    orders: List<Order>,
    hasUnreadMessage: Boolean,
    onTrackingClick: (String) -> Unit,
    onChatClick: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Pesanan aktif", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Black)
                Text("Lanjutkan pelacakan setelah aplikasi dibuka kembali.", color = Muted, fontSize = 13.sp)
            }
            Surface(
                color = MaterialTheme.colorScheme.secondaryContainer,
                shape = RoundedCornerShape(999.dp),
                border = BorderStroke(1.dp, LcGreen.copy(alpha = 0.18f)),
            ) {
                Text(
                    text = "${orders.size}",
                    color = LcGreen,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                    modifier = Modifier.padding(horizontal = 11.dp, vertical = 6.dp),
                )
            }
        }
        orders.take(5).forEach { order ->
            ActiveOrderCard(
                title = order.dropAddress.ifBlank { order.pickupAddress.ifBlank { "Pesanan ${order.orderNumber.ifBlank { order.orderId }}" } },
                subtitle = order.orderNumber.ifBlank { order.serviceCategory.orEmpty().ifBlank { "Pesanan TEMBUS" } },
                status = order.status,
                hasUnreadMessage = hasUnreadMessage,
                onClick = { onTrackingClick(order.orderId) },
                onChatClick = { onChatClick(order.orderId) },
            )
        }
    }
}

@Composable
internal fun ActiveOrderCard(
    title: String,
    subtitle: String,
    status: String,
    hasUnreadMessage: Boolean,
    onClick: () -> Unit,
    onChatClick: () -> Unit
) {
    val statusLower = status.lowercase()
    val isCancelled = statusLower in setOf("cancelled", "canceled", "failed", "rejected", "payment_failed") || statusLower.contains("cancel")
    val isDelivered = statusLower in setOf("delivered", "completed", "arrived")
    val isPending = statusLower in setOf("pending", "created", "waiting", "waiting_for_driver", "searching_driver")
    val canOpenChat = !isCancelled && !isDelivered && !isPending && statusLower in setOf(
        "assigned", "accepted", "picking_up", "picked_up", "in_transit", "delivering"
    )

    val displayTitle = when {
        isCancelled -> if (statusLower == "failed" || statusLower == "payment_failed") "Pengiriman Gagal" else "Pengiriman Dibatalkan"
        isDelivered -> "Pengiriman Selesai"
        else -> title
    }

    val statusColor = when {
        isCancelled -> Error
        isDelivered -> Success
        isPending -> Accent
        else -> LcGreen
    }

    val iconVector = when {
        isCancelled -> Icons.Default.Warning
        isDelivered -> Icons.Default.CheckCircle
        isPending -> Icons.Default.LocalShipping
        else -> Icons.Default.Navigation
    }

    val ctaText = when {
        isCancelled -> "Detail"
        isDelivered -> "Detail"
        isPending -> "Detail"
        else -> "Lacak"
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(statusColor.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(iconVector, contentDescription = "", tint = statusColor)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(displayTitle, color = Ink, fontWeight = FontWeight.Black, fontSize = 17.sp)
                Text(
                    subtitle,
                    color = Muted,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(humanOrderStatus(statusLower), color = statusColor, fontWeight = FontWeight.Bold, fontSize = 11.sp)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(ctaText, color = statusColor, fontWeight = FontWeight.ExtraBold)
                if (canOpenChat) {
                    Spacer(Modifier.height(8.dp))
                    Surface(
                        modifier = Modifier.clickable { onChatClick() },
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(999.dp),
                        border = BorderStroke(1.dp, LcGreen.copy(alpha = 0.24f))
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.ChatBubbleOutline, contentDescription = "", tint = LcGreen, modifier = Modifier.size(15.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Chat", color = LcGreen, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                            if (hasUnreadMessage) {
                                Spacer(Modifier.width(5.dp))
                                UnreadDot()
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun IncomingPackagesSection(
    packages: List<Order>,
    hasUnreadMessage: Boolean,
    onTrackingClick: (String) -> Unit,
    onChatClick: (String) -> Unit,
    onViewAllClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Paket Masuk", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Black)
                Text("Pantau paket yang dikirim ke nomor akun ini.", color = Muted, fontSize = 13.sp)
            }
            if (hasUnreadMessage) {
                UnreadDot(modifier = Modifier.padding(end = 8.dp))
            }
            TextButton(onClick = onViewAllClick) {
                Text("Lihat semua", color = LcGreen, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
            Surface(
                color = MaterialTheme.colorScheme.secondaryContainer,
                shape = RoundedCornerShape(999.dp),
                border = BorderStroke(1.dp, LcGreen.copy(alpha = 0.18f))
            ) {
                Text(
                    text = "${packages.size}",
                    color = LcGreen,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                    modifier = Modifier.padding(horizontal = 11.dp, vertical = 6.dp)
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            packages.take(3).forEach { order ->
                IncomingPackageCard(
                    order = order,
                    hasUnreadMessage = hasUnreadMessage,
                    onTrackingClick = { onTrackingClick(order.orderId) },
                    onChatClick = { onChatClick(order.orderId) }
                )
            }
        }
    }
}

@Composable
internal fun IncomingPackageCard(
    order: Order,
    hasUnreadMessage: Boolean,
    onTrackingClick: () -> Unit,
    onChatClick: () -> Unit
) {
    val normalizedStatus = order.status.lowercase()
    val isCancelled = normalizedStatus in setOf("cancelled", "canceled", "failed", "rejected", "payment_failed") || normalizedStatus.contains("cancel")
    val isDelivered = normalizedStatus in setOf("delivered", "completed", "arrived")
    val isPending = normalizedStatus in setOf("pending", "created", "waiting", "waiting_for_driver", "searching_driver")
    val canOpenChat = !isCancelled && !isDelivered && !isPending && normalizedStatus in setOf(
        "picked_up", "in_transit", "delivering", "delivered", "completed"
    )
    val statusColor = when {
        isCancelled -> Error
        isDelivered -> Success
        isPending -> Accent
        else -> LcGreen
    }
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onTrackingClick() },
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, SurfaceLine),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(statusColor.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.LocalShipping, contentDescription = "", tint = statusColor)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    order.dropAddress.ifBlank { order.pickupAddress.ifBlank { order.orderId } },
                    color = Ink,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    order.status.replace("_", " ").uppercase(),
                    color = statusColor,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            if (canOpenChat) {
                Surface(
                    modifier = Modifier.clickable { onChatClick() },
                    color = LcGreen,
                    shape = RoundedCornerShape(999.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.ChatBubbleOutline, contentDescription = "", tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Chat", color = MaterialTheme.colorScheme.onPrimary, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }
    }
}
