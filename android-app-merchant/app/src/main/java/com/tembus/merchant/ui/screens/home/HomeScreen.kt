package com.tembus.merchant.ui.screens.home

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.MerchantOrder
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryLight

/**
 * HomeScreen — tab Pesanan: list order merchant dengan filter status,
 * toggle buka/tutup toko, accept/reject order, dan akses struk.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onOpenStruk: (String) -> Unit,
    onGoToRegistration: () -> Unit,
    viewModel: HomeViewModel = appViewModel { HomeViewModel(it.merchantRepository) }
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

    // Dialog tolak order (reason wajib)
    rejectTarget?.let { order ->
        RejectOrderDialog(
            order = order,
            onConfirm = { reason ->
                viewModel.rejectOrder(order.id, reason)
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
        // Header merchant + toggle buka/tutup
        state.merchant?.let { m ->
            StoreHeaderCard(
                namaToko = m.namaToko,
                isOpen = m.isOpen,
                isToggleLoading = state.isToggleOpenLoading,
                verificationStatus = m.verificationStatus,
                onToggle = { viewModel.toggleOpen() }
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
            items(state.orders, key = { it.id }) { order ->
                OrderCard(
                    order = order,
                    isActionLoading = state.actionOrderId == order.id,
                    onAccept = { viewModel.acceptOrder(order.id) },
                    onReject = { rejectTarget = order },
                    onOpenStruk = { onOpenStruk(order.id) }
                )
            }
        }
    }
}

@Composable
private fun RejectOrderDialog(
    order: MerchantOrder,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var reason by remember(order.id) { mutableStateOf("Stok habis") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Tolak Order ${order.orderNumber}") },
        text = {
            Column {
                Text(
                    text = "Alasan wajib diisi. Order akan dibatalkan dengan alasan ini.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = { Text("Alasan penolakan") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(reason.trim().ifBlank { "Tidak ada alasan" }) },
                enabled = reason.isNotBlank()
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
private fun StoreHeaderCard(
    namaToko: String,
    isOpen: Boolean,
    isToggleLoading: Boolean,
    verificationStatus: String,
    onToggle: () -> Unit
) {
    Surface(
        color = Primary,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = namaToko,
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onPrimary,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = when (verificationStatus) {
                        "approved" -> if (isOpen) "Toko Buka" else "Toko Tutup"
                        "pending" -> "Menunggu verifikasi admin"
                        "rejected" -> "Verifikasi ditolak"
                        else -> "Status: $verificationStatus"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.85f)
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
                        enabled = !isToggleLoading
                    )
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
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        OrderFilter.entries.forEach { filter ->
            FilterChip(
                selected = selected == filter,
                onClick = { onSelect(filter) },
                label = { Text(filter.label) }
            )
        }
    }
}

@Composable
private fun OrderCard(
    order: MerchantOrder,
    isActionLoading: Boolean,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onOpenStruk: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp)
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

            order.customerName?.let {
                Text(
                    text = "Customer: $it",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            order.dropoffAddress?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
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

            Spacer(modifier = Modifier.height(8.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
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
                    color = Primary
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
                TextButton(onClick = onOpenStruk, modifier = Modifier.align(Alignment.End)) {
                    Icon(Icons.Filled.ReceiptLong, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Lihat Struk")
                }
            }
        }
    }
}

@Composable
private fun StatusBadge(status: String) {
    val (label, color, bg) = when (status) {
        "pending_merchant" -> Triple("Menunggu", Accent, MaterialTheme.colorScheme.tertiaryContainer)
        "preparing" -> Triple("Menyiapkan", Primary, PrimaryLight)
        "searching" -> Triple("Cari Kurir", Primary, PrimaryLight)
        "accepted", "picking_up", "picked_up" -> Triple("Kurir Menjemput", Primary, PrimaryLight)
        "delivering" -> Triple("Diantar", Primary, PrimaryLight)
        "delivered" -> Triple("Selesai", MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.primaryContainer)
        "cancelled_by_merchant" -> Triple("Ditolak", MaterialTheme.colorScheme.error, MaterialTheme.colorScheme.errorContainer)
        "cancelled" -> Triple("Batal", MaterialTheme.colorScheme.error, MaterialTheme.colorScheme.errorContainer)
        else -> Triple(status, MaterialTheme.colorScheme.onSurfaceVariant, MaterialTheme.colorScheme.surfaceVariant)
    }
    Surface(color = bg, shape = RoundedCornerShape(8.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = color,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
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
            text = "Daftarkan tokomu untuk mulai menerima pesanan makanan.",
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
