package com.tembus.merchant.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.merchant.data.model.MerchantOrder
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.AccentLight
import com.tembus.merchant.ui.theme.GreenText
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryLight
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * HomeScreen — tab Pesanan (design merchant 2026):
 * header hijau + toggle toko, filter status, order cards dengan badge
 * Baru/Siap + tombol Terima/Tolak, akses struk.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onOpenStruk: (String) -> Unit,
    onOpenChat: (String, String) -> Unit, // FB-119
    onGoToRegistration: () -> Unit,
    viewModel: HomeViewModel = appViewModel { HomeViewModel(it.merchantRepository, it.orderAlertNotifier) }
) {
    val state by viewModel.uiState.collectAsState()
    var rejectTarget by remember { mutableStateOf<MerchantOrder?>(null) }

    // Dialog error aksi (accept/reject/toggle)
    state.actionError?.let { msg ->
        AlertDialog(
            onDismissRequest = viewModel::clearActionError,
            confirmButton = {
                TextButton(onClick = viewModel::clearActionError) { Text("OK") }
            },
            title = { Text("Gagal") },
            text = { Text(msg) }
        )
    }

    // Dialog tolak order (reason wajib) — FB-122: alasan terstruktur
    rejectTarget?.let { order ->
        RejectOrderDialog(
            order = order,
            onConfirm = { reason, rejectReason ->
                viewModel.rejectOrder(order.id, reason, rejectReason)
                rejectTarget = null
            },
            onDismiss = { rejectTarget = null }
        )
    }

    if (state.needsRegistration) {
        NotRegisteredContent(onGoToRegistration)
        return
    }

    if (state.merchant == null && state.isLoading) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Header hijau + toggle buka/tutup
        state.merchant?.let { m ->
            OrdersHeader(
                namaToko = m.namaToko,
                isOpen = m.isOpen,
                isToggleLoading = state.isToggleOpenLoading,
                verificationStatus = m.verificationStatus,
                pausedUntil = m.pausedUntil,
                isPauseLoading = state.isPauseLoading,
                onToggle = { viewModel.toggleOpen() },
                onPause = viewModel::pause,
                onResume = viewModel::resume
            )
        }

        // Filter chips
        FilterChipsRow(
            selected = state.selectedFilter,
            onSelect = viewModel::selectFilter
        )

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return
        }

        if (state.errorMessage != null) {
            ErrorRetryContent(
                message = state.errorMessage.orEmpty(),
                onRetry = viewModel::load
            )
            return
        }

        if (state.orders.isEmpty()) {
            EmptyOrdersContent(onRefresh = viewModel::load)
            return
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // FB-123: section pesanan terjadwal hari ini — supaya merchant bisa
            // rencanakan kapasitas dari awal, meski order belum masuk antrian.
            val scheduledToday = state.orders.filter {
                it.status == "scheduled" && it.scheduledAt?.startsWith(todayPrefix()) == true
            }
            if (scheduledToday.isNotEmpty()) {
                item(key = "scheduled_header") {
                    ScheduledTodayHeader(count = scheduledToday.size)
                }
                items(scheduledToday, key = { "sched_${it.id}" }) { order ->
                    ScheduledOrderCard(order = order, onOpenStruk = { onOpenStruk(order.id) })
                }
            }

            items(state.orders, key = { it.id }) { order ->
                OrderCard(
                    order = order,
                    isActionLoading = state.actionOrderId == order.id,
                    onAccept = { viewModel.acceptOrder(order.id) },
                    onReject = { rejectTarget = order },
                    onOpenStruk = { onOpenStruk(order.id) },
                    onOpenChat = { onOpenChat(order.id, order.orderNumber) } // FB-119
                )
            }
        }
    }
}

@Composable
private fun RejectOrderDialog(
    order: MerchantOrder,
    onConfirm: (reason: String, rejectReason: String) -> Unit,
    onDismiss: () -> Unit
) {
    // FB-122: alasan reject terstruktur (enum) — pilihan radio + detail opsional.
    val rejectOptions = listOf(
        "stok_habis" to "Stok menu habis",
        "terlalu_sibuk" to "Terlalu sibuk",
        "tutup_mendadak" to "Tutup mendadak",
        "lainnya" to "Lainnya"
    )
    var selectedReason by remember(order.id) { mutableStateOf("stok_habis") }
    var detail by remember(order.id) { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Tolak Order ${order.orderNumber}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = "Alasan wajib diisi. Order akan dibatalkan dan customer melihat alasan ini.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                rejectOptions.forEach { (code, label) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(
                            selected = selectedReason == code,
                            onClick = { selectedReason = code }
                        )
                        Text(
                            label,
                            modifier = Modifier
                                .padding(start = 4.dp)
                                .clickable { selectedReason = code }
                        )
                    }
                }
                if (selectedReason == "lainnya") {
                    OutlinedTextField(
                        value = detail,
                        onValueChange = { detail = it },
                        label = { Text("Detail alasan (opsional)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(detail.trim(), selectedReason) },
                enabled = selectedReason != "lainnya" || detail.isNotBlank()
            ) {
                Text("Tolak", color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Batal") }
        }
    )
}

@Composable
private fun OrdersHeader(
    namaToko: String,
    isOpen: Boolean,
    isToggleLoading: Boolean,
    verificationStatus: String,
    pausedUntil: String?,
    isPauseLoading: Boolean,
    onToggle: () -> Unit,
    onPause: (Int) -> Unit,
    onResume: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Primary)
            .padding(start = 20.dp, end = 20.dp, top = 24.dp, bottom = 18.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Pesanan",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimary
                )
                Text(
                    text = when (verificationStatus) {
                        "approved" -> if (isOpen) "$namaToko — toko buka" else "$namaToko — toko tutup"
                        "pending" -> "Menunggu verifikasi admin"
                        "rejected" -> "Verifikasi ditolak"
                        else -> namaToko
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            if (verificationStatus == "approved") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = if (isOpen) "Buka" else "Tutup",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Switch(
                        checked = isOpen,
                        onCheckedChange = { if (!isToggleLoading) onToggle() },
                        enabled = !isToggleLoading,
                        colors = SwitchDefaults.colors(
                            checkedTrackColor = Accent,
                            checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
                            uncheckedTrackColor = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.3f)
                        )
                    )
                }
            }
        }

        // FB-107: pause sementara — merchant tetap "buka" tapi tidak terima
        // order baru selama durasi. Auto un-pause backend, tanpa aksi manual.
        if (verificationStatus == "approved") {
            Spacer(modifier = Modifier.height(12.dp))
            val pausedEpoch = remember(pausedUntil) {
                pausedUntil?.let {
                    try {
                        java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli()
                    } catch (_: Exception) {
                        null
                    }
                }
            }
            if (pausedEpoch != null && pausedEpoch > System.currentTimeMillis()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "⏸ Sedang pause sementara",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.weight(1f)
                    )
                    TextButton(
                        onClick = onResume,
                        enabled = !isPauseLoading
                    ) {
                        Text(
                            if (isPauseLoading) "..." else "Resume sekarang",
                            color = Accent,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            } else if (isOpen) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "Pause sementara:",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f)
                    )
                    listOf(15, 30, 60).forEach { minutes ->
                        OutlinedButton(
                            onClick = { onPause(minutes) },
                            enabled = !isPauseLoading,
                            modifier = Modifier.height(32.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = MaterialTheme.colorScheme.onPrimary
                            ),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.5f))
                        ) {
                            Text(
                                text = if (isPauseLoading) "..." else "${minutes}m",
                                style = MaterialTheme.typography.labelMedium
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FilterChipsRow(
    selected: OrderFilter,
    onSelect: (OrderFilter) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        OrderFilter.entries.forEach { filter ->
            val isSelected = selected == filter
            Surface(
                color = if (isSelected) AccentLight else MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(20.dp),
                border = androidx.compose.foundation.BorderStroke(
                    1.dp,
                    if (isSelected) Accent else MaterialTheme.colorScheme.outline
                ),
                onClick = { onSelect(filter) }
            ) {
                Text(
                    text = filter.label,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                    color = if (isSelected) Accent else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                )
            }
        }
    }
}

@Composable
private fun OrderCard(
    order: MerchantOrder,
    isActionLoading: Boolean,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onOpenStruk: () -> Unit,
    onOpenChat: () -> Unit // FB-119: chat customer↔merchant
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = order.orderNumber,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.weight(1f))
                StatusBadge(status = order.status)
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = order.customerName ?: "Customer",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.weight(1f))
                Text(
                    text = Format.time(order.createdAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            order.dropoffAddress?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            order.items.take(3).forEach { item ->
                Text(
                    text = "${item.quantity}× ${item.itemName}",
                    style = MaterialTheme.typography.bodySmall
                )
            }
            if (order.items.size > 3) {
                Text(
                    text = "+${order.items.size - 3} item lainnya",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // FB-121: catatan level order dari customer (mis. "pisahin sambal semua")
            if (!order.orderNotes.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "📝 ${order.orderNotes}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(modifier = Modifier.height(8.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))

            Row(
                modifier = Modifier.padding(top = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Total",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.weight(1f))
                Text(
                    text = Format.rupiah(order.totalPriceIdr),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = GreenText
                )
            }

            if (order.status == "pending_merchant") {
                Spacer(modifier = Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = onReject,
                        enabled = !isActionLoading,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = MaterialTheme.colorScheme.error
                        )
                    ) {
                        Icon(Icons.Filled.Cancel, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Tolak")
                    }
                    Button(
                        onClick = onAccept,
                        enabled = !isActionLoading,
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Filled.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Terima")
                    }
                }
            }

            if (order.status in HomeViewModel.activeStatuses || order.status == "delivered") {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // FB-119: chat dengan customer seputar order ini.
                    TextButton(onClick = onOpenChat) {
                        Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Chat")
                    }
                    TextButton(onClick = onOpenStruk) {
                        Icon(Icons.Filled.ReceiptLong, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Lihat Struk")
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusBadge(status: String) {
    val (label, color, bg) = when (status) {
        "pending_merchant" -> Triple("Baru", Accent, AccentLight)
        "preparing" -> Triple("Diproses", Primary, PrimaryLight)
        "searching" -> Triple("Siap", Primary, PrimaryLight)
        "accepted", "picking_up", "picked_up" -> Triple("Diambil Driver", Primary, PrimaryLight)
        "delivering" -> Triple("Diantar", Primary, PrimaryLight)
        "delivered" -> Triple("Selesai", MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.primaryContainer)
        "cancelled_by_merchant" -> Triple("Ditolak", MaterialTheme.colorScheme.error, MaterialTheme.colorScheme.errorContainer)
        "cancelled" -> Triple("Dibatalkan", MaterialTheme.colorScheme.error, MaterialTheme.colorScheme.errorContainer)
        // FB-123: order terjadwal — belum masuk antrian, hanya informasi.
        "scheduled" -> Triple("🕐 Terjadwal", Color(0xFF7C3AED), Color(0xFFEDE9FE))
        else -> Triple(status, MaterialTheme.colorScheme.onSurfaceVariant, MaterialTheme.colorScheme.surfaceVariant)
    }
    Surface(color = bg, shape = RoundedCornerShape(8.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = color,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
        )
    }
}

@Composable
private fun EmptyOrdersContent(onRefresh: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Filled.Storefront,
            contentDescription = null,
            modifier = Modifier.size(56.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Belum ada order",
            style = MaterialTheme.typography.titleMedium
        )
        Text(
            text = "Order baru akan muncul di sini",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(16.dp))
        OutlinedButton(onClick = onRefresh) {
            Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(4.dp))
            Text("Muat Ulang")
        }
    }
}

// ── FB-123: pesanan terjadwal hari ini ──

// todayPrefix — prefix tanggal UTC (YYYY-MM-DD) untuk filter scheduled_at
// milik hari ini (scheduled_at dikirim UTC ISO oleh backend merchant).
private fun todayPrefix(): String {
    return java.time.LocalDate.now(java.time.ZoneOffset.UTC).toString()
}

// parseScheduledTime — scheduled_at UTC ISO → jam lokal (HH:mm).
private fun parseScheduledTime(scheduledAt: String?): String {
    if (scheduledAt.isNullOrBlank()) return ""
    return try {
        OffsetDateTime.parse(scheduledAt)
            .atZoneSameInstant(ZoneId.systemDefault())
            .format(DateTimeFormatter.ofPattern("HH:mm"))
    } catch (e: Exception) {
        ""
    }
}

@Composable
private fun ScheduledTodayHeader(count: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFFEDE9FE), RoundedCornerShape(12.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "🕐 Pesanan Terjadwal Hari Ini",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF5B21B6)
        )
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "$count order",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF7C3AED)
        )
    }
}

@Composable
private fun ScheduledOrderCard(order: MerchantOrder, onOpenStruk: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFAF5FF))
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = order.orderNumber,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.weight(1f))
                StatusBadge(status = order.status)
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "Diantar ~${parseScheduledTime(order.scheduledAt)} — ${order.customerName ?: "Customer"}",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF6D28D9)
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "Belum masuk antrian — akan aktif otomatis mendekati jam dijadwalkan.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(6.dp))
            TextButton(onClick = onOpenStruk, modifier = Modifier.align(Alignment.End)) {
                Icon(Icons.Filled.ReceiptLong, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Lihat Struk", fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun ErrorRetryContent(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onRetry) { Text("Coba Lagi") }
    }
}

@Composable
private fun NotRegisteredContent(onGoToRegistration: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Filled.Storefront,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = Primary
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Belum Terdaftar sebagai Merchant",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Daftarkan tokomu untuk mulai menerima pesanan.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = onGoToRegistration) {
            Text("Daftar Sekarang")
        }
    }
}
