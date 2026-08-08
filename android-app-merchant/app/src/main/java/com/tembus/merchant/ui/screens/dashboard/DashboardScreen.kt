package com.tembus.merchant.ui.screens.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.MerchantOrder
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.GreenText
import com.tembus.merchant.ui.theme.OnSurfaceVariant
import com.tembus.merchant.ui.theme.Primary

/**
 * DashboardScreen — tab Dashboard (design merchant 2026):
 * greeting + kartu pendapatan oranye + ringkasan + pesanan terbaru.
 */
@Composable
fun DashboardScreen(
    onGoToOrders: () -> Unit,
    onOpenStruk: (String) -> Unit,
    onGoToRegistration: () -> Unit,
    viewModel: DashboardViewModel = appViewModel { DashboardViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()

    if (state.needsRegistration) {
        NotRegisteredCard(onGoToRegistration)
        return
    }

    if (state.merchant == null && state.isLoading) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item {
            DashboardHeader(
                namaToko = state.merchant?.namaToko ?: "Restoran Anda",
                isOpen = state.merchant?.isOpen == true,
                verificationStatus = state.merchant?.verificationStatus ?: "pending"
            )
        }

        item {
            RevenueCard(report = state.report)
        }

        item {
            SummarySection(
                report = state.report,
                avgRating = state.merchant?.avgRating ?: 0.0,
                ratingCount = state.merchant?.ratingCount ?: 0
            )
        }

        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 20.dp, end = 12.dp, top = 24.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Pesanan Terbaru",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                TextButton(onClick = onGoToOrders) {
                    Text("Lihat Semua", color = Accent)
                    Icon(
                        Icons.Filled.ChevronRight,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = Accent
                    )
                }
            }
        }

        if (state.recentOrders.isEmpty() && !state.isLoading) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Belum ada pesanan hari ini",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            items(state.recentOrders, key = { it.id }) { order ->
                RecentOrderRow(order = order, onOpenStruk = { onOpenStruk(order.id) })
            }
        }

        item { Spacer(modifier = Modifier.height(24.dp)) }
    }
}

@Composable
private fun DashboardHeader(
    namaToko: String,
    isOpen: Boolean,
    verificationStatus: String
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Primary)
            .padding(start = 20.dp, end = 20.dp, top = 28.dp, bottom = 28.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Halo, $namaToko!",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = when {
                        verificationStatus != "approved" -> "Menunggu verifikasi admin"
                        isOpen -> "Toko buka — semangat jualannya hari ini!"
                        else -> "Toko tutup — buka toko untuk terima pesanan"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f)
                )
            }
            // Avatar
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = namaToko.take(1).uppercase(),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimary
                )
            }
        }
    }
}

@Composable
private fun RevenueCard(report: com.tembus.merchant.data.model.SalesReportSummary?) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 16.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(Accent)
            .padding(20.dp)
    ) {
        Text(
            text = "Total Pendapatan Hari Ini",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.9f)
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = Format.rupiah(report?.gmvIdr ?: 0L),
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onPrimary
        )
        Spacer(modifier = Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Surface(
                color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.2f),
                shape = RoundedCornerShape(50)
            ) {
                Text(
                    text = "${report?.totalOrders ?: 0} pesanan",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                )
            }
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = "dari pesanan selesai",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f)
            )
        }
    }
}

@Composable
private fun SummarySection(
    report: com.tembus.merchant.data.model.SalesReportSummary?,
    avgRating: Double,
    ratingCount: Int
) {
    Column(modifier = Modifier.padding(horizontal = 20.dp)) {
        Text(
            text = "Ringkasan",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SummaryCard(
                value = "${report?.totalOrders ?: 0}",
                label = "Total Pesanan",
                modifier = Modifier.weight(1f)
            )
            SummaryCard(
                value = Format.rupiah(report?.gmvIdr ?: 0L),
                label = "Pendapatan Bersih",
                modifier = Modifier.weight(1f)
            )
            SummaryCard(
                value = if (ratingCount > 0) "%.1f★".format(avgRating) else "—",
                label = if (ratingCount > 0) "Rating ($ratingCount)" else "Rating Restoran",
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun SummaryCard(
    value: String,
    label: String,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = GreenText,
                maxLines = 1
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun RecentOrderRow(
    order: MerchantOrder,
    onOpenStruk: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 6.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Filled.ReceiptLong,
                    contentDescription = null,
                    tint = Primary,
                    modifier = Modifier.size(22.dp)
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = order.orderNumber,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = order.customerName ?: "Customer",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = Format.rupiah(order.totalPriceIdr),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = GreenText
                )
                TextButton(
                    onClick = onOpenStruk,
                    contentPadding = PaddingValues(0.dp)
                ) {
                    Text("Struk", style = MaterialTheme.typography.labelMedium, color = Accent)
                }
            }
        }
    }
}

@Composable
private fun NotRegisteredCard(onGoToRegistration: () -> Unit) {
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
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Daftarkan tokomu untuk mulai menerima pesanan.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = onGoToRegistration) {
            Text("Daftar Sekarang")
        }
    }
}
