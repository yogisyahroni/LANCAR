package com.tembus.merchant.ui.screens.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.RestaurantMenu
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import com.tembus.merchant.ui.localization.MerchantText as Text
import com.tembus.merchant.ui.localization.MerchantTextCatalog
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.MerchantOrder
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale

/** ZIP Order History port. Summary, filters, and cards are backed by order API data. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderHistoryZipScreen(
    onBack: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenOrder: (MerchantOrder) -> Unit,
    viewModel: OrderHistoryViewModel = appViewModel { OrderHistoryViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()

    PullToRefreshBox(
        isRefreshing = state.isLoading && state.orders.isNotEmpty(),
        onRefresh = viewModel::load,
        modifier = Modifier.fillMaxSize()
    ) {
    Scaffold(
        containerColor = PrimaryPale,
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.primaryContainer,
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(Icons.Filled.RestaurantMenu, contentDescription = "", tint = Primary, modifier = Modifier.padding(7.dp))
                        }
                        Spacer(Modifier.size(8.dp))
                        Text("Tembus", fontWeight = FontWeight.Bold)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = MerchantTextCatalog.translate("Kembali")) }
                },
                actions = {
                    IconButton(onClick = onOpenNotifications) { Icon(Icons.Filled.Notifications, contentDescription = MerchantTextCatalog.translate("Notifikasi")) }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = PrimaryPale)
            )
        }
    ) { padding ->
        when {
            state.isLoading && state.orders.isEmpty() -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Primary)
            }
            state.errorMessage != null && state.orders.isEmpty() -> HistoryLoadError(
                message = state.errorMessage.orEmpty(),
                onRetry = viewModel::load,
                modifier = Modifier.fillMaxSize().padding(padding)
            )
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                item {
                    Text("Riwayat Pesanan", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = Primary)
                    Text("Pantau performa penjualan Anda bulan ini.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                item {
                    HistorySummary(
                        total = state.totalCount,
                        completed = state.completedCount,
                        cancelled = state.cancelledCount,
                        rejected = state.rejectedCount
                    )
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        HistoryFilterChip("Semua", null, state.selectedStatus, viewModel::selectStatus)
                        HistoryFilterChip("Selesai", "delivered", state.selectedStatus, viewModel::selectStatus)
                        HistoryFilterChip("Batal", "cancelled", state.selectedStatus, viewModel::selectStatus)
                        HistoryFilterChip("Ditolak", "rejected", state.selectedStatus, viewModel::selectStatus)
                    }
                }
                if (state.errorMessage != null) {
                    item { Text(state.errorMessage.orEmpty(), color = MaterialTheme.colorScheme.error) }
                }
                if (!state.isLoading && state.orders.isEmpty()) {
                    item { Text("Belum ada riwayat pesanan.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                } else {
                    items(state.orders, key = { it.id }) { order ->
                        HistoryOrderZipCard(order = order, onClick = { onOpenOrder(order) })
                    }
                }
            }
        }
    }
    }
}

@Composable
private fun HistorySummary(total: Int, completed: Int, cancelled: Int, rejected: Int) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        SummaryCard("TOTAL PESANAN", total.toString(), Primary, Modifier.weight(1.35f), Icons.Filled.ReceiptLong)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SummaryCard("Selesai", completed.toString(), MaterialTheme.colorScheme.primary, Modifier.fillMaxWidth(), Icons.Filled.CheckCircle)
            SummaryCard("Dibatalkan", cancelled.toString(), MaterialTheme.colorScheme.error, Modifier.fillMaxWidth(), Icons.Filled.Cancel)
        }
        SummaryCard("Ditolak", rejected.toString(), MaterialTheme.colorScheme.secondary, Modifier.weight(1f), Icons.Filled.Block)
    }
}

@Composable
private fun SummaryCard(label: String, value: String, accent: androidx.compose.ui.graphics.Color, modifier: Modifier, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = accent)
                Spacer(Modifier.size(4.dp))
                Icon(icon, contentDescription = "", tint = accent, modifier = Modifier.size(14.dp))
            }
        }
    }
}

@Composable
private fun HistoryFilterChip(label: String, status: String?, selectedStatus: String?, onSelect: (String?) -> Unit) {
    FilterChip(selected = selectedStatus == status, onClick = { onSelect(status) }, label = { Text(label) })
}

@Composable
private fun HistoryOrderZipCard(order: MerchantOrder, onClick: () -> Unit) {
    val rejected = order.isMerchantRejected()
    val cancelled = order.status == "cancelled" && !rejected
    val statusLabel = when {
        rejected -> "DITOLAK"
        cancelled -> "BATAL"
        order.status == "delivered" -> "SELESAI"
        else -> order.status.ifBlank { "TIDAK TERSEDIA" }.uppercase()
    }
    val statusColor = when {
        rejected || cancelled -> MaterialTheme.colorScheme.error
        order.status == "delivered" -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "#${order.orderNumber}",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = if (cancelled || rejected) MaterialTheme.colorScheme.onSurfaceVariant else Primary,
                    textDecoration = if (cancelled || rejected) TextDecoration.LineThrough else TextDecoration.None
                )
                Spacer(Modifier.size(8.dp))
                Surface(color = statusColor.copy(alpha = 0.12f), shape = RoundedCornerShape(percent = 50)) {
                    Text(statusLabel, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), style = MaterialTheme.typography.labelSmall, color = statusColor)
                }
            }
            Text(
                "${order.customerName?.takeIf { it.isNotBlank() } ?: "Pelanggan"} • ${order.createdAt?.take(16) ?: "Waktu tidak tersedia"}",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                order.items.joinToString { "${it.itemName} x${it.quantity}" }.ifBlank { "Detail item tidak tersedia" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(Format.rupiah(order.totalPriceIdr), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = if (cancelled || rejected) MaterialTheme.colorScheme.onSurfaceVariant else Primary)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Detail", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.secondary)
                    Icon(Icons.Filled.ChevronRight, contentDescription = "", tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}

@Composable
private fun HistoryLoadError(message: String, onRetry: () -> Unit, modifier: Modifier) {
    Column(modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(message, color = MaterialTheme.colorScheme.error)
        Spacer(Modifier.size(12.dp))
        OutlinedButton(onClick = onRetry) { Text("Coba Lagi") }
    }
}

private fun MerchantOrder.isMerchantRejected(): Boolean =
    status == "cancelled_by_merchant" || !rejectReason.isNullOrBlank()
