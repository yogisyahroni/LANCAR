package com.tembus.merchant.ui.screens.home

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.MerchantOrder
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.PrimaryPale
import com.tembus.merchant.ui.theme.TembusRadius

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

    Column(modifier = Modifier.fillMaxSize().background(PrimaryPale)) {
        TopAppBar(
            title = {
                Column {
                    Text(state.merchant?.namaToko ?: "Merchant", fontWeight = FontWeight.Bold)
                    Text("Pesanan", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
            actions = {
                IconButton(onClick = onOpenNotifications) {
                    Icon(Icons.Filled.NotificationsNone, contentDescription = "Notifikasi")
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = PrimaryPale)
        )

        if (state.isLoading && state.merchant == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
            item {
                StoreStatusCard(
                    name = state.merchant?.namaToko ?: "Merchant",
                    isOpen = state.merchant?.isOpen == true,
                    onToggle = viewModel::toggleOpen
                )
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    MetricCard(
                        modifier = Modifier.weight(1f),
                        label = "PESANAN HARI INI",
                        value = state.report?.totalOrders?.toString() ?: "—",
                        trend = state.report?.let { "${Format.rupiah(it.gmvIdr)}" }
                    )
                    MetricCard(
                        modifier = Modifier.weight(1f),
                        label = "PENDAPATAN",
                        value = state.report?.let { Format.rupiah(it.gmvIdr) } ?: "—",
                        trend = null
                    )
                }
            }
            item { FilterTabs(state.selectedFilter, viewModel::selectFilter) }
            if (state.actionError != null) {
                item { ErrorPanel(state.actionError.orEmpty(), viewModel::clearActionError) }
            }
            if (state.errorMessage != null) {
                item {
                    ErrorPanel(state.errorMessage.orEmpty(), viewModel::load)
                }
            } else if (!state.isLoading && state.orders.isEmpty()) {
                item { Text("Belum ada pesanan pada filter ini.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 24.dp)) }
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
                        isActionLoading = state.actionOrderId == order.id
                    )
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
}

@Composable
private fun StoreStatusCard(name: String, isOpen: Boolean, onToggle: () -> Unit) {
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
                Icon(Icons.Filled.Storefront, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(if (isOpen) "Toko aktif" else "Toko tidak aktif", style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
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
                    Icon(Icons.Filled.TrendingUp, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(4.dp))
                    Text(trend, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

@Composable
private fun FilterTabs(selected: OrderFilter, onSelect: (OrderFilter) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(OrderFilter.NEW, OrderFilter.ACTIVE, OrderFilter.DONE, OrderFilter.REJECTED).forEach { filter ->
            val active = selected == filter
            Surface(
                modifier = Modifier.clickable { onSelect(filter) },
                color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(TembusRadius.Button),
                border = if (active) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Text(filter.label, color = if (active) Color.White else MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp), style = MaterialTheme.typography.labelMedium)
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
    isActionLoading: Boolean
) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(TembusRadius.Card)
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                StatusLabel(order)
                Text(Format.rupiah(order.totalPriceIdr), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            }
            Spacer(Modifier.height(8.dp))
            Text("#${order.orderNumber}", fontWeight = FontWeight.Bold)
            Text("${order.customerName ?: "Pelanggan"} • ${Format.time(order.createdAt)}", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
            Row(verticalAlignment = Alignment.CenterVertically) {
                androidx.compose.material3.TextButton(onClick = onOpenChat) {
                    Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Chat")
                }
                androidx.compose.material3.TextButton(onClick = onCallCustomer, enabled = !order.customerPhone.isNullOrBlank()) {
                    Icon(Icons.Filled.Phone, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Telepon")
                }
            }
            Divider(Modifier.padding(vertical = 12.dp))
            order.items.take(3).forEach { item -> Text("${item.quantity}x ${item.itemName}", style = MaterialTheme.typography.bodyMedium) }
            if (order.items.isEmpty()) Text("Detail item belum tersedia", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                OutlinedButton(onClick = onOpen) { Text("Lihat detail") }
                Spacer(Modifier.width(8.dp))
                if (order.status == "pending_merchant") {
                    OutlinedButton(onClick = onReject, enabled = !isActionLoading) {
                        Text("Tolak", color = MaterialTheme.colorScheme.error)
                    }
                    Spacer(Modifier.width(8.dp))
                }
                Button(
                    onClick = when (order.status) {
                        "pending_merchant" -> onAccept
                        "preparing", "accepted" -> onReady
                        else -> onOpen
                    },
                    enabled = !isActionLoading,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                ) {
                    if (isActionLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                    } else {
                        Icon(if (order.status == "pending_merchant") Icons.Filled.Check else Icons.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(18.dp))
                    }
                    Spacer(Modifier.width(4.dp))
                    Text(
                        when (order.status) {
                            "pending_merchant" -> "Terima"
                            "preparing", "accepted" -> "Tandai siap"
                            else -> "Buka"
                        }
                    )
                }
            }
        }
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
private fun ErrorPanel(message: String, onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(message, color = MaterialTheme.colorScheme.error)
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onRetry) { Text("Coba lagi") }
    }
}
