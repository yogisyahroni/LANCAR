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
    val title = primaryOrder.dropAddress.ifBlank {
        primaryOrder.pickupAddress.ifBlank { "Pesanan ${primaryOrder.orderNumber.ifBlank { primaryOrder.orderId }}" }
    }
    val statusHuman = humanOrderStatus(primaryOrder.status.lowercase())

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
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(CircleShape)
                    .background(SoftGreen),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.LocalShipping,
                    contentDescription = null,
                    tint = LcGreen,
                    modifier = Modifier.size(22.dp)
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = if (orderCount > 1) "Pesanan Aktif ($orderCount)" else "Pesanan Sedang Berjalan",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = LcGreen
                    )
                    if (hasUnreadMessage) {
                        Spacer(Modifier.width(6.dp))
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(Accent)
                        )
                    }
                }
                Spacer(Modifier.height(2.dp))
                Text(
                    text = "$title • $statusHuman",
                    fontSize = 12.sp,
                    color = Muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                // DESIGN.md §11.5/§12: order ID + chip status + progres mini.
                // Alasan: kartu menjawab status & progres tanpa membuka detail.
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "ID ${primaryOrder.orderNumber.ifBlank { primaryOrder.orderId.take(8) }}",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Muted,
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    TembusBadge(label = CustomerTextCatalog.translate(statusHuman), tone = activeOrderBadgeTone(primaryOrder.status.lowercase()))
                }
                Spacer(Modifier.height(8.dp))
                LinearProgressIndicator(
                    progress = { activeOrderProgress(primaryOrder.status.lowercase()) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(5.dp)
                        .clip(CircleShape),
                    color = LcGreen,
                    trackColor = LcGreen.copy(alpha = 0.18f),
                )
            }
            Spacer(Modifier.width(8.dp))
            Button(
                onClick = {
                    if (orderCount == 1) onTrackingClick(primaryOrder.orderId) else onViewAllClick()
                },
                shape = RoundedCornerShape(TembusRadius.Button),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (orderCount > 1) Accent else LcGreen,
                    contentColor = Color.White
                ),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                modifier = Modifier.height(34.dp)
            ) {
                Text(
                    text = if (orderCount > 1) "Semua ($orderCount)" else "Lacak",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.width(4.dp))
                Icon(
                    Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp)
                )
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
