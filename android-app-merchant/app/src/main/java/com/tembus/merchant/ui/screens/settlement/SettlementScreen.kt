package com.tembus.merchant.ui.screens.settlement

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.SettlementRecord
import com.tembus.merchant.data.model.SettlementSummary
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.GreenText
import com.tembus.merchant.ui.theme.Info
import com.tembus.merchant.ui.theme.Primary

/**
 * SettlementScreen — "Riwayat Pencairan" (FB-113).
 * Menampilkan total sudah cair, total ditahan, + daftar settlement
 * (tanggal, nominal, status, referensi transaksi) dari
 * GET /api/v1/merchant/settlements.
 */
@Composable
fun SettlementScreen(
    onBack: () -> Unit,
    viewModel: SettlementViewModel = appViewModel { SettlementViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        // Header hijau
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Primary)
                .statusBarsPadding()
                .padding(horizontal = 8.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Kembali",
                    tint = MaterialTheme.colorScheme.onPrimary
                )
            }
            Column {
                Text(
                    text = "Riwayat Pencairan",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimary
                )
                Text(
                    text = "Status settlement & payout ke rekening",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f)
                )
            }
        }

        when {
            state.isLoading -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Primary)
                }
            }
            state.errorMessage != null -> {
                // Box + Center — pola terbukti center (Column fillMaxSize
                // sebagai child terakhir Column menggantung; debug 2026-08-11)
                Box(
                    Modifier.fillMaxSize().padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(state.errorMessage!!, color = MaterialTheme.colorScheme.error, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                        Spacer(Modifier.height(12.dp))
                        Button(onClick = { viewModel.load() }) { Text("Coba Lagi") }
                    }
                }
            }
            else -> {
                val summary = state.summary
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (summary != null) {
                        item { SummaryCards(summary = summary) }
                    }
                    item {
                        Text(
                            text = "Riwayat",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = GreenText,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                    if (summary == null || summary.records.isEmpty()) {
                        item {
                            EmptyState()
                        }
                    } else {
                        items(summary.records, key = { it.id }) { record ->
                            SettlementRow(record = record)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryCards(summary: SettlementSummary) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        SummaryCard(
            modifier = Modifier.weight(1f),
            label = "Sudah Cair",
            value = Format.rupiah(summary.totalIdr),
            valueColor = GreenText
        )
        SummaryCard(
            modifier = Modifier.weight(1f),
            label = "Ditahan",
            value = Format.rupiah(summary.holdingIdr),
            valueColor = MaterialTheme.colorScheme.primary // WCAG AA fix 2026-08-11: oranye di putih 2.97 -> hijau tua 13.85
        )
    }
}

@Composable
private fun SummaryCard(modifier: Modifier, label: String, value: String, valueColor: Color) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Color.White)
            .padding(16.dp)
    ) {
        Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = valueColor)
        Spacer(Modifier.height(8.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.ExtraBold,
            color = valueColor
        )
    }
}

@Composable
private fun SettlementRow(record: SettlementRecord) {
    val (statusText, statusColor, bgColor) = when (record.status) {
        "COMPLETED" -> Triple("CAIR", GreenText, GreenText.copy(alpha = 0.10f))
        "HOLDING" -> Triple("DITAHAN", MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)) // WCAG AA fix: oranye 2.97 -> hijau tua 13.85
        "PROCESSING" -> Triple("PROSES", Info, Info.copy(alpha = 0.10f))
        "FAILED", "DISPUTED" -> Triple(record.status, MaterialTheme.colorScheme.error, MaterialTheme.colorScheme.error.copy(alpha = 0.10f))
        else -> Triple(record.status, MaterialTheme.colorScheme.onSurfaceVariant, MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.10f))
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color.White)
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = Format.rupiah(record.netPayoutIdr),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.ExtraBold,
                color = GreenText
            )
            Text(
                text = statusText,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(bgColor)
                    .padding(horizontal = 10.dp, vertical = 4.dp),
                color = statusColor,
                fontWeight = FontWeight.Black,
                style = MaterialTheme.typography.labelSmall
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(
            text = Format.dateTime(record.settledAt ?: record.holdingReleaseAt ?: record.createdAt),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (!record.disbursementRef.isNullOrBlank()) {
            Text(
                text = "Ref: ${record.disbursementRef}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (!record.failureReason.isNullOrBlank()) {
            Text(
                text = "Gagal: ${record.failureReason}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error
            )
        }
    }
}

@Composable
private fun EmptyState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color.White)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Belum ada pencairan",
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = "Settlement muncul otomatis setelah pesanan selesai & melewati periode penahanan.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
            modifier = Modifier.padding(top = 4.dp)
        )
    }
}
