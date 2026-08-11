package com.tembus.merchant.ui.screens.report

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tembus.merchant.R
import com.tembus.merchant.data.model.SalesReportSummary
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.screens.settlement.SettlementScreen
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.FreshGreen
import com.tembus.merchant.ui.theme.FreshGreenDark
import com.tembus.merchant.ui.theme.GreenText
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryDark

/**
 * ReportScreen — tab Laporan (design merchant 2026):
 * pendapatan bersih + item terlaris (bar chart) + ringkasan.
 * Data dari GET /api/v1/merchant/reports?period=daily|weekly (FB-086).
 */
@Composable
fun ReportScreen(
    viewModel: ReportViewModel = appViewModel { ReportViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()

    // FB-113: navigasi internal ke screen "Riwayat Pencairan".
    var showSettlement by remember { mutableStateOf(false) }
    if (showSettlement) {
        SettlementScreen(onBack = { showSettlement = false })
        return
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Header hijau — AUDIT-FIX 2026-08-11: tambah statusBarsPadding
        // (sebelumnya tanpa → teks bisa ketutup status bar di device ber-notch;
        // 4 screen lain sudah pakai).
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Primary)
                .statusBarsPadding()
                .padding(start = 20.dp, end = 20.dp, top = 24.dp, bottom = 20.dp)
        ) {
            Text(
                text = "Laporan",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimary
            )
            Text(
                text = if (state.period == ReportPeriod.DAILY) "Ringkasan penjualan hari ini" else "Ringkasan penjualan 7 hari terakhir",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f)
            )
            Spacer(modifier = Modifier.height(16.dp))
            // Toggle periode
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.15f))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                ReportPeriod.entries.forEach { period ->
                    val selected = state.period == period
                    Surface(
                        color = if (selected) MaterialTheme.colorScheme.onPrimary else Color.Transparent,
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.weight(1f),
                        onClick = { viewModel.selectPeriod(period) }
                    ) {
                        Text(
                            text = period.label,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                            color = if (selected) Primary else MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.85f),
                            modifier = Modifier.padding(vertical = 8.dp),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
            }
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            state.errorMessage?.let { msg ->
                item {
                    Card(
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Filled.Info,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                text = msg,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            }

            val report = state.report
            item {
                RevenueSummaryCard(report = report)
            }

            item {
                Text(
                    text = "Item Terlaris",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
            }

            if (report?.topItems.isNullOrEmpty()) {
                item {
                    Text(
                        text = "Belum ada penjualan pada periode ini.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                items(report!!.topItems.size) { index ->
                    TopItemRow(
                        rank = index + 1,
                        itemName = report.topItems[index].itemName,
                        quantity = report.topItems[index].quantity,
                        revenue = report.topItems[index].revenueIdr,
                        maxQuantity = report.topItems.maxOfOrNull { it.quantity } ?: 1
                    )
                }
            }

            item {
                SummaryCard(report = report)
            }

            // FB-113: pintu masuk ke riwayat pencairan/payout.
            item {
                Card(
                    onClick = { showSettlement = true },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Icon(
                            Icons.Default.AccountBalanceWallet,
                            contentDescription = null,
                            tint = Accent
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Riwayat Pencairan",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "Status payout & settlement ke rekening",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Icon(
                            Icons.AutoMirrored.Filled.KeyboardArrowRight,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            item { Spacer(modifier = Modifier.height(16.dp)) }
        }
    }
}

@Composable
private fun RevenueSummaryCard(report: SalesReportSummary?) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            // Gradient hijau TUA pekat — kontras WCAG AA utk teks putih (13.85:1).
            // Sebelumnya FreshGreen->FreshGreenDark 2.28:1 FAIL (konsisten dgn
            // fix RevenueCard dashboard 2026-08-11).
            .background(
                Brush.linearGradient(
                    listOf(Primary, PrimaryDark)
                )
            )
            .padding(20.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "Pendapatan Bersih",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.9f),
                modifier = Modifier.weight(1f)
            )
            // Ilustrasi dompet abu-abu — referensi user 2026-08-11
            Image(
                painter = painterResource(R.drawable.ill_wallet),
                contentDescription = null,
                modifier = Modifier.size(30.dp),
                contentScale = ContentScale.Fit
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = Format.rupiah(report?.gmvIdr ?: 0L),
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onPrimary
        )
        Spacer(modifier = Modifier.height(10.dp))
        Text(
            text = "${report?.totalOrders ?: 0} pesanan selesai",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.85f)
        )
    }
}

@Composable
private fun TopItemRow(
    rank: Int,
    itemName: String,
    quantity: Int,
    revenue: Long,
    maxQuantity: Int
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (rank == 1) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant), // WCAG AA fix: oranye+putih 2.97 -> hijau tua+putih 13.85
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "$rank",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = if (rank == 1) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = itemName,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    text = "$quantity terjual",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            // Bar chart
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(quantity.toFloat() / maxQuantity.coerceAtLeast(1))
                        .height(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(Accent)
                )
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = Format.rupiah(revenue),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = GreenText
            )
        }
    }
}

@Composable
private fun SummaryCard(report: SalesReportSummary?) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Text(
                text = "Ringkasan",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(14.dp))
            Row {
                SummaryValue(
                    label = "Total Pesanan",
                    value = "${report?.totalOrders ?: 0}",
                    modifier = Modifier.weight(1f)
                )
                SummaryValue(
                    label = "Rata-rata Pesanan",
                    value = Format.rupiah(report?.avgOrderValueIdr ?: 0L),
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun SummaryValue(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = GreenText
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
