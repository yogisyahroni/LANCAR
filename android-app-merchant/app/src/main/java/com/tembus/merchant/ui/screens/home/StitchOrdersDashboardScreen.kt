package com.tembus.merchant.ui.screens.home

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.RestaurantMenu
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import com.tembus.merchant.ui.localization.MerchantText as Text
import com.tembus.merchant.ui.localization.MerchantTextCatalog
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.merchant.data.model.MerchantOrder
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.PrimaryPale
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.AccentSoft
import com.tembus.merchant.ui.theme.Background
import com.tembus.merchant.ui.theme.OnSurfaceSecondary
import com.tembus.merchant.ui.theme.PrimarySoft
import com.tembus.merchant.ui.theme.Success
import com.tembus.merchant.ui.theme.TembusRadius
import kotlinx.coroutines.delay
import java.time.Instant

/**
 * Dashboard post-login dari flow zip, tetapi seluruh konten berasal dari API.
 * Tidak ada order/nilai fallback di layar ini; empty/error tetap ditangani oleh
 * HomeViewModel sehingga UAT tidak tertipu oleh data presentasi.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun StitchOrdersDashboardScreen(
    onOpenOrder: (String) -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenChat: (String, String) -> Unit,
    onCallCustomer: (String) -> Unit,
    viewModel: HomeViewModel = appViewModel { HomeViewModel(it.merchantRepository, it.orderAlertNotifier) }
) {
    val state by viewModel.uiState.collectAsState()
    var rejectTarget by remember { mutableStateOf<MerchantOrder?>(null) }
    var partialRejectTarget by remember { mutableStateOf<MerchantOrder?>(null) }

    // Figma order board refreshes its server snapshot without resetting the
    // selected tab. Push/socket notifications remain hints; this is the
    // canonical refetch path for customer/merchant/courier convergence.
    LaunchedEffect(Unit) {
        while (true) {
            delay(5_000)
            viewModel.refreshOrders()
        }
    }

    PullToRefreshBox(
        isRefreshing = state.isLoading && state.merchant != null,
        onRefresh = viewModel::load,
        modifier = Modifier.fillMaxSize()
    ) {
        Column(modifier = Modifier.fillMaxSize().background(Background)) {
            MerchantOrdersHeader(
                merchant = state.merchant?.namaToko ?: "Merchant",
                address = state.merchant?.alamat.orEmpty(),
                isOpen = state.merchant?.isOpen == true,
                onOpenNotifications = onOpenNotifications,
            )

            if (state.isLoading && state.merchant == null) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item {
                        KitchenDeviceBanner(state.posStatus)
                    }
                    item {
                        OrderFilterTabs(
                            selected = state.selectedFilter,
                            counts = state.orderCounts,
                            onSelect = viewModel::selectFilter,
                        )
                    }
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "${state.orderCounts?.newCount ?: state.orders.count { it.status == "pending_merchant" }} Pesanan Membutuhkan Konfirmasi Segera",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.weight(1f),
                            )
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(14.dp), tint = OnSurfaceSecondary)
                                Spacer(Modifier.width(4.dp))
                                Text("Auto-refresh 5s", style = MaterialTheme.typography.labelSmall, color = OnSurfaceSecondary)
                            }
                        }
                    }
                    if (state.actionError != null) {
                        item { ErrorPanel(state.actionError.orEmpty(), viewModel::clearActionError) }
                    }
                    if (state.errorMessage != null) {
                        item { ErrorPanel(state.errorMessage.orEmpty(), viewModel::load) }
                    } else if (!state.isLoading && state.orders.isEmpty()) {
                        item { EmptyOrdersState(state.selectedFilter) }
                    } else {
                        items(state.orders, key = { it.id }) { order ->
                            StitchOrderCard(
                                order = order,
                                onOpen = { onOpenOrder(order.id) },
                                onOpenChat = { onOpenChat(order.id, order.orderNumber) },
                                onCallCustomer = { onCallCustomer(order.customerPhone.orEmpty()) },
                                onAccept = { viewModel.acceptOrder(order.id) },
                                onReady = { viewModel.markReady(order.id) },
                                onReject = { rejectTarget = order },
                                onPartialReject = { partialRejectTarget = order },
                                isActionLoading = state.actionOrderId == order.id,
                            )
                        }
                    }
                }
            }
        }
    }

    rejectTarget?.let { order ->
        RejectOrderDialog(
            order = order,
            isSubmitting = state.actionOrderId == order.id,
            onConfirm = { reason, rejectReason ->
                rejectTarget = null
                viewModel.rejectOrder(order.id, reason, rejectReason)
            },
            onDismiss = { if (state.actionOrderId == null) rejectTarget = null }
        )
    }

    partialRejectTarget?.let { order ->
        PartialRejectDialog(
            order = order,
            isSubmitting = state.actionOrderId == order.id,
            onConfirm = { items, reason ->
                partialRejectTarget = null
                viewModel.partialRejectOrder(order.id, items, reason)
            },
            onDismiss = { if (state.actionOrderId == null) partialRejectTarget = null },
        )
    }

}

@Composable
private fun StoreStatusCard(
    name: String,
    isOpen: Boolean,
    isPaused: Boolean,
    isBusy: Boolean,
    onToggle: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onBusy: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(TembusRadius.Card)
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column {
                    Text(name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(if (isOpen) "Menerima pesanan" else "Toko sedang tutup", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(
                    checked = isOpen,
                    onCheckedChange = { onToggle() },
                    colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = MaterialTheme.colorScheme.primary)
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Storefront, contentDescription = "", modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    when {
                        isPaused -> "Pesanan dijeda sementara"
                        isBusy -> "Tetap menerima pesanan — waktu masak bertambah"
                        isOpen -> "Toko aktif"
                        else -> "Toko tidak aktif"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Spacer(Modifier.height(8.dp))
            if (isPaused) {
                OutlinedButton(onClick = onResume, enabled = true) { Text("Lanjutkan pesanan") }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onPause, enabled = isOpen && !isBusy, modifier = Modifier.weight(1f)) { Text("Jeda") }
                    OutlinedButton(onClick = onBusy, enabled = isOpen, modifier = Modifier.weight(1f)) { Text("Mode sibuk") }
                }
            }
        }
    }
}

@Composable
private fun MerchantOrdersHeader(
    merchant: String,
    address: String,
    isOpen: Boolean,
    onOpenNotifications: () -> Unit,
) {
    val initials = merchant.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
        .take(2).joinToString("") { it.first().uppercase() }.ifBlank { "M" }
    Surface(color = MaterialTheme.colorScheme.surface, modifier = Modifier.statusBarsPadding()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Surface(color = PrimaryDarkSurface, shape = RoundedCornerShape(50)) {
                Text(initials, color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.padding(12.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(merchant, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.width(4.dp))
                    Icon(Icons.Filled.Verified, contentDescription = "Terverifikasi", tint = PrimaryDarkSurface, modifier = Modifier.size(16.dp))
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(color = PrimarySoft, shape = RoundedCornerShape(5.dp)) {
                        Text("MITRA JUARA", color = PrimaryDarkSurface, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                    }
                    Spacer(Modifier.width(6.dp))
                    Text("• ${address.ifBlank { "Lokasi toko" }}", maxLines = 1, overflow = TextOverflow.Ellipsis, color = OnSurfaceSecondary, style = MaterialTheme.typography.labelSmall)
                }
            }
            Surface(color = if (isOpen) PrimarySoft else MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(50)) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                    Surface(color = if (isOpen) Success else MaterialTheme.colorScheme.outline, shape = RoundedCornerShape(50), modifier = Modifier.size(8.dp)) {}
                    Spacer(Modifier.width(6.dp))
                    Text(if (isOpen) "BUKA" else "TUTUP", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = if (isOpen) PrimaryDarkSurface else OnSurfaceSecondary)
                }
            }
            IconButton(onClick = onOpenNotifications) {
                Icon(Icons.Filled.NotificationsNone, contentDescription = MerchantTextCatalog.translate("Notifikasi"))
            }
        }
    }
}

private val PrimaryDarkSurface = Color(0xFF004F2B)

@Composable
private fun KitchenDeviceBanner(posStatus: com.tembus.merchant.data.model.MerchantPOSIntegrationStatus?) {
    val connector = posStatus?.connectors?.firstOrNull { it.enabled } ?: posStatus?.connectors?.firstOrNull()
    val connected = connector?.enabled == true && connector.state.lowercase() in setOf("connected", "ready", "healthy", "active")
    var testBell by remember { mutableStateOf(false) }
    LaunchedEffect(testBell) {
        if (testBell) {
            delay(600)
            testBell = false
        }
    }
    Card(
        colors = CardDefaults.cardColors(containerColor = if (connected) PrimaryDarkSurface else MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(10.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.VolumeUp, contentDescription = null, tint = if (connected) Color.White else PrimaryDarkSurface, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("Speaker Dapur ${if (connected) "Terhubung" else "Belum Terhubung"}", color = if (connected) Color.White else MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    text = connector?.let { "${it.providerName.ifBlank { it.providerCode }} • ${it.state.ifBlank { "status tidak tersedia" }}" } ?: "Belum ada perangkat dapur dari server",
                    color = if (connected) Color.White.copy(alpha = 0.80f) else OnSurfaceSecondary,
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            TextButton(onClick = { testBell = true }) {
                Text(if (testBell) "Berbunyi" else "Tes Bel", color = if (connected) Color.White else PrimaryDarkSurface, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun EmptyOrdersState(filter: OrderFilter) {
    Surface(color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Filled.RestaurantMenu, contentDescription = null, tint = OnSurfaceSecondary, modifier = Modifier.size(32.dp))
            Spacer(Modifier.height(10.dp))
            Text("Belum ada pesanan ${filter.label.lowercase()}", fontWeight = FontWeight.Bold)
            Text("Pesanan baru dari customer akan muncul otomatis di sini.", color = OnSurfaceSecondary, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun PauseOrdersDialog(
    isSubmitting: Boolean,
    onConfirm: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    var selectedMinutes by remember { mutableStateOf(30) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Jeda pesanan") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Pesanan baru akan dijeda selama:")
                listOf(15, 30, 60, 180).forEach { minutes ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(
                            selected = selectedMinutes == minutes,
                            onClick = { selectedMinutes = minutes },
                        )
                        Text("$minutes menit", modifier = Modifier.clickable { selectedMinutes = minutes })
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = { onConfirm(selectedMinutes) }, enabled = !isSubmitting) {
                Text(if (isSubmitting) "Menyimpan..." else "Jeda sekarang")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !isSubmitting) { Text("Batal") } },
    )
}

@Composable
private fun BusyOrdersDialog(
    isSubmitting: Boolean,
    onConfirm: (durationMinutes: Int, extraPrepMinutes: Int) -> Unit,
    onDismiss: () -> Unit,
) {
    var selectedDuration by remember { mutableStateOf(60) }
    var selectedExtraPrep by remember { mutableStateOf(15) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Mode sibuk") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Toko tetap menerima order, tetapi ETA persiapan ditambah:")
                Text("Durasi", fontWeight = FontWeight.Bold)
                listOf(30, 60, 120, 180).forEach { minutes ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = selectedDuration == minutes, onClick = { selectedDuration = minutes })
                        Text("$minutes menit", modifier = Modifier.clickable { selectedDuration = minutes })
                    }
                }
                Text("Tambahan waktu masak", fontWeight = FontWeight.Bold)
                listOf(10, 15, 30, 60).forEach { minutes ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = selectedExtraPrep == minutes, onClick = { selectedExtraPrep = minutes })
                        Text("+$minutes menit", modifier = Modifier.clickable { selectedExtraPrep = minutes })
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = { onConfirm(selectedDuration, selectedExtraPrep) }, enabled = !isSubmitting) {
                Text(if (isSubmitting) "Menyimpan..." else "Aktifkan mode sibuk")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !isSubmitting) { Text("Batal") } },
    )
}

@Composable
private fun MetricCard(modifier: Modifier, label: String, value: String, trend: String?) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(TembusRadius.Card)
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            if (trend != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.TrendingUp, contentDescription = "", modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(4.dp))
                    Text(trend, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

@Composable
private fun OrderFilterTabs(
    selected: OrderFilter,
    counts: com.tembus.merchant.data.model.OrderCounts?,
    onSelect: (OrderFilter) -> Unit,
) {
    val filters = listOf(OrderFilter.NEW, OrderFilter.ACTIVE, OrderFilter.READY, OrderFilter.DELIVERING, OrderFilter.DONE)
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(vertical = 2.dp)) {
        items(filters) { filter ->
            val active = selected == filter
            val count = when (filter) {
                OrderFilter.NEW -> counts?.newCount
                OrderFilter.ACTIVE -> counts?.preparing
                OrderFilter.READY -> counts?.readyForPickup
                OrderFilter.DELIVERING -> counts?.delivering
                OrderFilter.DONE -> counts?.completed
                OrderFilter.REJECTED -> counts?.rejected
            }
            Surface(
                modifier = Modifier.clickable { onSelect(filter) },
                color = if (active) Accent else MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(50),
                border = if (active) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 14.dp, vertical = 9.dp)) {
                    Text(filter.label, color = if (active) Color.White else MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.labelMedium, fontWeight = if (active) FontWeight.Bold else FontWeight.Normal)
                    if (count != null) {
                        Spacer(Modifier.width(6.dp))
                        Surface(color = if (active) Color.White.copy(alpha = 0.20f) else AccentSoft, shape = RoundedCornerShape(50)) {
                            Text(count.toString(), color = if (active) Color.White else Accent, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StitchOrderCard(
    order: MerchantOrder,
    onOpen: () -> Unit,
    onOpenChat: () -> Unit,
    onCallCustomer: () -> Unit,
    onAccept: () -> Unit,
    onReady: () -> Unit,
    onReject: () -> Unit,
    onPartialReject: () -> Unit,
    isActionLoading: Boolean
) {
    var nowEpochSecond by remember(order.id) { mutableLongStateOf(Instant.now().epochSecond) }
    LaunchedEffect(order.id, order.merchantAcceptedAt, order.foodReadyAt) {
        while (true) {
            nowEpochSecond = Instant.now().epochSecond
            delay(1_000)
        }
    }
    val prepTimer = prepTimerState(
        now = Instant.ofEpochSecond(nowEpochSecond),
        acceptedAt = order.merchantAcceptedAt,
        readyAt = order.foodReadyAt,
    )

    val customerName = order.customerName?.takeIf { it.isNotBlank() } ?: "Pelanggan"
    val initials = customerName.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
        .take(2).joinToString("") { it.first().uppercase() }.ifBlank { "?" }
    val paymentLabel = when (order.paymentStatus?.lowercase()) {
        "paid", "settled" -> "LUNAS ${order.paymentMethod?.uppercase()?.takeIf { it.isNotBlank() } ?: "TEMBUS-PAY"}"
        "pending", "created" -> "MENUNGGU PEMBAYARAN"
        "failed", "expired" -> "PEMBAYARAN GAGAL"
        else -> "STATUS PEMBAYARAN BELUM TERSEDIA"
    }
    val category = if (order.scheduledAt.isNullOrBlank()) "Instant Food" else "Food Terjadwal"
    val locationLabel = order.dropoffAddress?.takeIf { it.isNotBlank() } ?: "Alamat customer belum tersedia"

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("#${order.orderNumber}", fontWeight = FontWeight.Bold, color = OnSurfaceSecondary)
                    Text(category, color = Accent, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                }
                Surface(color = PrimarySoft, shape = RoundedCornerShape(50)) {
                    Text("${Format.time(order.createdAt)} • ${order.statusLabel()}", color = PrimaryDarkSurface, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp))
                }
            }
            Spacer(Modifier.height(14.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(color = AccentSoft, shape = RoundedCornerShape(50), modifier = Modifier.size(38.dp)) {
                    Box(contentAlignment = Alignment.Center) { Text(initials, color = Accent, fontWeight = FontWeight.Bold) }
                }
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(customerName, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (order.isNewCustomer) {
                            Spacer(Modifier.width(6.dp))
                            Surface(color = PrimarySoft, shape = RoundedCornerShape(4.dp)) {
                                Text("PELANGGAN BARU", color = PrimaryDarkSurface, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 5.dp, vertical = 3.dp))
                            }
                        }
                    }
                    Text("$locationLabel • ${"%.1f".format(java.util.Locale.US, order.distanceKm)} km dari resto", color = OnSurfaceSecondary, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                IconButton(onClick = onOpenChat) { Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = "Chat pelanggan", tint = PrimaryDarkSurface) }
                IconButton(onClick = onCallCustomer, enabled = !order.customerPhone.isNullOrBlank()) { Icon(Icons.Filled.Phone, contentDescription = "Telepon pelanggan", tint = PrimaryDarkSurface) }
            }
            if (prepTimer.hasSchedule && order.status in setOf("preparing", "accepted")) {
                PrepCountdownBanner(prepTimer)
            }
            Divider(Modifier.padding(vertical = 14.dp))
            if (order.items.isEmpty()) {
                Text("Detail item belum tersedia dari server", color = OnSurfaceSecondary, style = MaterialTheme.typography.bodySmall)
            } else {
                order.items.take(4).forEach { item ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("${item.quantity}× ${item.itemName}", modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(Format.rupiah(item.subtotal), fontWeight = FontWeight.SemiBold)
                    }
                    item.notes?.takeIf { it.isNotBlank() }?.let { note ->
                        Text("Catatan: $note", color = OnSurfaceSecondary, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 18.dp))
                    }
                }
                if (order.items.size > 4) Text("+${order.items.size - 4} item lainnya", color = OnSurfaceSecondary, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
            }
            order.orderNotes?.takeIf { it.isNotBlank() }?.let { note ->
                Surface(color = PrimarySoft, shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
                    Text("“$note”", color = PrimaryDarkSurface, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(10.dp))
                }
            }
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
                Column {
                    Text("Total Pembayaran", color = OnSurfaceSecondary, style = MaterialTheme.typography.labelSmall)
                    Text(Format.rupiah(order.totalPriceIdr), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                }
                Surface(color = if (order.paymentStatus?.lowercase() in setOf("paid", "settled")) PrimarySoft else AccentSoft, shape = RoundedCornerShape(50)) {
                    Text(paymentLabel, color = if (order.paymentStatus?.lowercase() in setOf("paid", "settled")) PrimaryDarkSurface else Accent, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp))
                }
            }
            OutlinedButton(onClick = onOpen, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Icon(Icons.Filled.Print, contentDescription = null, modifier = Modifier.size(17.dp))
                Spacer(Modifier.width(6.dp))
                Text("Cetak Tiket")
            }
            if (order.status == "pending_merchant") {
                Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onReject, enabled = !isActionLoading, modifier = Modifier.weight(1f)) { Text("Tolak / Habis", color = MaterialTheme.colorScheme.error) }
                    Button(onClick = onAccept, enabled = !isActionLoading, modifier = Modifier.weight(1.25f), colors = ButtonDefaults.buttonColors(containerColor = Accent)) {
                        if (isActionLoading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White) else Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(5.dp))
                        Text("Terima & Masak")
                    }
                }
                if (order.items.isNotEmpty()) {
                    TextButton(onClick = onPartialReject, enabled = !isActionLoading, modifier = Modifier.align(Alignment.End)) { Text("Ada item yang habis?", color = OnSurfaceSecondary) }
                }
            } else if (order.status == "preparing") {
                Button(onClick = onReady, enabled = !isActionLoading, modifier = Modifier.fillMaxWidth().padding(top = 10.dp), colors = ButtonDefaults.buttonColors(containerColor = PrimaryDarkSurface)) {
                    if (isActionLoading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White) else Icon(Icons.Filled.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Tandai Siap Diambil")
                }
            }
        }
    }
}

private fun MerchantOrder.statusLabel(): String = when {
    isMerchantRejected() -> "Ditolak"
    status == "pending_merchant" -> "Baru"
    status == "preparing" -> "Diproses"
    status in HomeViewModel.readyStatuses -> "Siap Diambil"
    status in HomeViewModel.deliveringStatuses -> "Diantar"
    status == "delivered" -> "Selesai"
    else -> status.replace('_', ' ').replaceFirstChar { it.uppercase() }
}

@Composable
private fun PrepCountdownBanner(state: PrepTimerState) {
    val color = if (state.isOverdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
    val label = if (state.isOverdue) {
        "Waktu persiapan terlewati — tandai siap setelah makanan selesai"
    } else {
        "Estimasi siap dalam ${formatPrepCountdown(state.remainingSeconds)}"
    }
    Surface(
        color = color.copy(alpha = 0.10f),
        shape = RoundedCornerShape(TembusRadius.Button),
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
    ) {
        Text(
            text = label,
            color = color,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
        )
    }
}

@Composable
private fun StatusLabel(order: MerchantOrder) {
    val label = when {
        order.isMerchantRejected() -> "Ditolak"
        order.status == "pending_merchant" -> "Baru"
        order.status == "preparing" || order.status == "accepted" -> "Diproses"
        order.status == "delivered" -> "Selesai"
        order.status == "cancelled" || order.status == "cancelled_by_merchant" -> "Dibatalkan"
        else -> order.status.replace('_', ' ').replaceFirstChar { it.uppercase() }
    }
    Surface(color = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f), shape = RoundedCornerShape(TembusRadius.Button)) {
        Text(label, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), style = MaterialTheme.typography.labelMedium)
    }
}

private fun MerchantOrder.isMerchantRejected(): Boolean =
    status == "cancelled_by_merchant" || !rejectReason.isNullOrBlank()

@Composable
private fun RejectOrderDialog(
    order: MerchantOrder,
    isSubmitting: Boolean,
    onConfirm: (reason: String, rejectReason: String) -> Unit,
    onDismiss: () -> Unit
) {
    val options = listOf(
        "stok_habis" to "Stok menu habis",
        "terlalu_sibuk" to "Terlalu sibuk",
        "tutup_mendadak" to "Tutup mendadak",
        "lainnya" to "Lainnya"
    )
    var selected by remember(order.id) { mutableStateOf("stok_habis") }
    var detail by remember(order.id) { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Tolak Order ${order.orderNumber}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Pilih alasan agar customer menerima informasi yang jelas.", style = MaterialTheme.typography.bodySmall)
                options.forEach { (code, label) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = selected == code, onClick = { selected = code })
                        Text(label, modifier = Modifier.clickable { selected = code })
                    }
                }
                if (selected == "lainnya") {
                    OutlinedTextField(
                        value = detail,
                        onValueChange = { detail = it },
                        label = { Text("Detail alasan") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        },
        confirmButton = {
            androidx.compose.material3.TextButton(
                onClick = { onConfirm(detail.trim(), selected) },
                enabled = !isSubmitting && (selected != "lainnya" || detail.isNotBlank())
            ) { Text(if (isSubmitting) "Mengirim..." else "Tolak", color = MaterialTheme.colorScheme.error) }
        },
        dismissButton = { androidx.compose.material3.TextButton(onClick = onDismiss, enabled = !isSubmitting) { Text("Batal") } }
    )
}

@Composable
private fun PartialRejectDialog(
    order: MerchantOrder,
    isSubmitting: Boolean,
    onConfirm: (List<com.tembus.merchant.data.model.PartialRejectItemRequest>, String) -> Unit,
    onDismiss: () -> Unit,
) {
    var selectedIds by remember(order.id) { mutableStateOf(emptySet<String>()) }
    var reason by remember(order.id) { mutableStateOf("Stok menu habis") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Item tidak tersedia") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "Pilih item yang tidak dapat dipenuhi. Order lain tetap berjalan dan customer menerima refund item.",
                    style = MaterialTheme.typography.bodySmall,
                )
                order.items.forEach { item ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = item.menuItemId in selectedIds,
                            onCheckedChange = { checked ->
                                selectedIds = if (checked) selectedIds + item.menuItemId else selectedIds - item.menuItemId
                            },
                        )
                        Text("${item.quantity}x ${item.itemName}")
                    }
                }
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = { Text("Alasan") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val items = order.items.filter { it.menuItemId in selectedIds }.map {
                        com.tembus.merchant.data.model.PartialRejectItemRequest(it.menuItemId, it.quantity, reason.trim())
                    }
                    onConfirm(items, reason.trim())
                },
                enabled = !isSubmitting && selectedIds.isNotEmpty() && reason.isNotBlank(),
            ) { Text(if (isSubmitting) "Memproses..." else "Refund item") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !isSubmitting) { Text("Batal") } },
    )
}

@Composable
private fun ErrorPanel(message: String, onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(message, color = MaterialTheme.colorScheme.error)
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onRetry) { Text("Coba lagi") }
    }
}
