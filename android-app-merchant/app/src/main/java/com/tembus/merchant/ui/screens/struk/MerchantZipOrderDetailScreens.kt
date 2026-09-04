package com.tembus.merchant.ui.screens.struk

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import com.tembus.merchant.ui.localization.MerchantText as Text
import com.tembus.merchant.ui.localization.MerchantTextCatalog
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.FoodOrderItem
import com.tembus.merchant.data.model.StrukData
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Primary

@Composable
fun OrderDetailMerchantZipScreen(orderId: String, onBack: () -> Unit) {
    MerchantZipOrderDetailScreen(orderId = orderId, onBack = onBack)
}

@Composable
fun OrderDetailCancelledZipScreen(orderId: String, onBack: () -> Unit) {
    MerchantZipOrderDetailScreen(orderId = orderId, onBack = onBack)
}

@Composable
fun OrderDetailRejectedZipScreen(orderId: String, onBack: () -> Unit) {
    MerchantZipOrderDetailScreen(orderId = orderId, onBack = onBack)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MerchantZipOrderDetailScreen(
    orderId: String,
    onBack: () -> Unit,
    viewModel: StrukViewModel = appViewModel { StrukViewModel(it.merchantRepository, orderId) }
) {
    val state by viewModel.uiState.collectAsState()
    val orderNumber = state.struk?.orderNumber?.takeIf(String::isNotBlank) ?: "Order Detail"

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (orderNumber == "Order Detail") orderNumber else "#$orderNumber", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = MerchantTextCatalog.translate("Go back"))
                    }
                }
            )
        }
    ) { padding ->
        when {
            state.isLoading -> LoadingOrderDetail(Modifier.fillMaxSize().padding(padding))
            state.errorMessage != null -> ErrorOrderDetail(
                message = state.errorMessage.orEmpty(),
                onRetry = viewModel::load,
                modifier = Modifier.fillMaxSize().padding(padding)
            )
            state.struk != null -> OrderDetailContent(
                struk = state.struk!!,
                modifier = Modifier.fillMaxSize().padding(padding)
            )
        }
    }
}

@Composable
private fun OrderDetailContent(struk: StrukData, modifier: Modifier) {
    val rejected = struk.rejectReason?.isNotBlank() == true
    val cancelled = !rejected && struk.status.lowercase().contains("cancel")
    val statusTitle = when {
        rejected -> "Pesanan Ditolak"
        cancelled -> "Pesanan Dibatalkan"
        struk.status.equals("delivered", ignoreCase = true) -> "Pesanan Selesai"
        else -> statusLabel(struk.status)
    }
    val statusColor = if (rejected || cancelled) MaterialTheme.colorScheme.error else Color(0xFF15803D)

    LazyColumn(
        modifier = modifier.padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item { Spacer(Modifier.height(8.dp)) }
        item {
            OrderStatusCard(
                title = statusTitle,
                timestamp = struk.createdAt ?: "Waktu tidak tersedia",
                isNegative = rejected || cancelled,
                statusColor = statusColor
            )
        }
        if (rejected || cancelled) {
            item {
                DetailSectionCard(containerColor = MaterialTheme.colorScheme.errorContainer) {
                    Text(
                        if (rejected) "ALASAN PENOLAKAN" else "ALASAN PEMBATALAN",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                    Text(
                        (if (rejected) struk.rejectReason else struk.cancellationReason)
                            ?.takeIf(String::isNotBlank) ?: "Alasan tidak tersedia dari backend",
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                }
            }
        }
        item {
            DetailSectionCard {
                SectionLabel(Icons.Filled.Person, "PELANGGAN")
                Text(struk.customerName?.takeIf(String::isNotBlank) ?: "Nama pelanggan tidak tersedia", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
        }
        item {
            DetailSectionCard {
                SectionLabel(Icons.Filled.LocalShipping, "PENGIRIMAN")
                Text(
                    struk.dropoffAddress?.takeIf(String::isNotBlank) ?: "Alamat pengiriman tidak tersedia",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        item {
            DetailSectionCard {
                SectionLabel(Icons.Filled.Restaurant, "RINCIAN PESANAN")
                Divider(Modifier.padding(vertical = 12.dp))
                if (struk.items.isEmpty()) {
                    Text("Item pesanan tidak tersedia dari backend", color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    struk.items.forEach { item -> OrderItemRow(item) }
                }
            }
        }
        item {
            DetailSectionCard {
                SectionLabel(Icons.Filled.Payments, "RINCIAN PEMBAYARAN")
                Divider(Modifier.padding(vertical = 12.dp))
                PaymentRow("Subtotal", Format.rupiah(struk.subtotalIdr))
                PaymentRow("Biaya pengiriman", Format.rupiah(struk.deliveryFeeIdr))
                Divider(Modifier.padding(vertical = 12.dp))
                PaymentRow("Total Pendapatan", Format.rupiah(struk.totalPriceIdr), emphasize = true)
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun OrderStatusCard(title: String, timestamp: String, isNegative: Boolean, statusColor: Color) {
    DetailSectionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Surface(
                shape = CircleShape,
                color = if (isNegative) MaterialTheme.colorScheme.errorContainer else Color(0x2215803D),
                modifier = Modifier.size(40.dp)
            ) {
                Icon(
                    if (isNegative) Icons.Filled.Cancel else Icons.Filled.CheckCircle,
                    contentDescription = "",
                    tint = statusColor,
                    modifier = Modifier.padding(8.dp)
                )
            }
            Spacer(Modifier.size(16.dp))
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium, color = statusColor, fontWeight = FontWeight.Bold)
                Text(timestamp, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun DetailSectionCard(
    containerColor: Color = MaterialTheme.colorScheme.surface,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = containerColor),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    }
}

@Composable
private fun SectionLabel(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = "", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
        Spacer(Modifier.size(8.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun OrderItemRow(item: FoodOrderItem) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("${item.quantity}x", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Column(Modifier.weight(1f)) {
            Text(item.itemName.ifBlank { "Item tidak tersedia" }, fontWeight = FontWeight.Bold)
            item.variants.takeIf { it.isNotEmpty() }?.let { variants ->
                Text(variants.joinToString { "${it.variantName}: ${it.optionName}" }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            item.notes?.takeIf(String::isNotBlank)?.let { Text("Catatan: $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        Text(Format.rupiah(item.subtotal), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun PaymentRow(label: String, value: String, emphasize: Boolean = false) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = if (emphasize) MaterialTheme.typography.titleLarge else MaterialTheme.typography.bodyMedium, fontWeight = if (emphasize) FontWeight.Bold else FontWeight.Normal)
        Text(value, style = if (emphasize) MaterialTheme.typography.titleLarge else MaterialTheme.typography.bodyMedium, fontWeight = if (emphasize) FontWeight.Bold else FontWeight.Normal)
    }
}

@Composable
private fun LoadingOrderDetail(modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        CircularProgressIndicator(color = Primary)
    }
}

@Composable
private fun ErrorOrderDetail(message: String, onRetry: () -> Unit, modifier: Modifier) {
    Column(modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(message, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.error)
        Spacer(Modifier.height(16.dp))
        Button(onClick = onRetry) { Text("Coba Lagi") }
    }
}

private fun statusLabel(status: String): String = when (status.lowercase()) {
    "pending_merchant" -> "Menunggu konfirmasi"
    "accepted" -> "Pesanan diterima"
    "preparing" -> "Sedang diproses"
    "ready" -> "Siap diambil"
    "picked_up" -> "Sedang dikirim"
    else -> status.replace('_', ' ').replaceFirstChar { it.uppercase() }.ifBlank { "Status tidak tersedia" }
}
