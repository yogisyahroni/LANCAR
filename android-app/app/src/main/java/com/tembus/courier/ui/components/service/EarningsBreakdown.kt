package com.tembus.courier.ui.components.service

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ============================================================
// EARNINGS BREAKDOWN — Model B Settlement Display
// ============================================================

data class EarningsData(
    val serviceFee: Long = 0,
    val baseFee: Long = 0,
    val perKmRate: Long = 0,
    val distanceKm: Double = 0.0,
    val travelFee: Long = 0,
    val tollCost: Long = 0,
    val platformCommissionPct: Double = 20.0,
    val platformCommissionAmt: Long = 0,
    val platformServiceFee: Long = 0,
    val estimatedNetEarnings: Long = 0,
    val settlementModel: String = "per_km" // pool or per_km
)

@Composable
fun EarningsBreakdown(
    data: EarningsData,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        Text(
            "Penghasilan Anda",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        
        Spacer(Modifier.height(16.dp))
        
        // Service fee (100% to courier)
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.tertiaryContainer,
            shape = RoundedCornerShape(8.dp)
        ) {
            Row(
                Modifier.padding(12.dp).fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        "Harga Jasa (Anda tentukan)",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onTertiaryContainer
                    )
                    Text(
                        "100% milik Anda",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onTertiaryContainer.copy(alpha = 0.7f)
                    )
                }
                Text(
                    formatRupiah(data.serviceFee),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.tertiary
                )
            }
        }
        
        Spacer(Modifier.height(12.dp))
        
        // Biaya perjalanan (base fare + per km) — pakai travel fee dari backend snapshot
        EarningRow(
            label = "Perjalanan ${data.distanceKm} km",
            amount = data.travelFee,
            icon = "🛵"
        )
        
        // Toll (100% reimbursement)
        if (data.tollCost > 0) {
            EarningRow(
                label = "Biaya Tol (Dibayar Penuh)",
                amount = data.tollCost,
                icon = "🔄"
            )
        }
        
        HorizontalDivider(Modifier.padding(vertical = 8.dp))
        
        // Komisi platform (pct dinamis dari admin)
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(
                    "Komisi Platform ${platformCommissionPctLabel(data.platformCommissionPct)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                                    "dari biaya perjalanan saja",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                                )
            }
            Text(
                "-${formatRupiah(data.platformCommissionAmt)}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error
            )
        }
        
        HorizontalDivider(Modifier.padding(vertical = 12.dp), thickness = 2.dp)
        
        // Biaya layanan platform (fixed, dibayar customer — bukan pendapatan kurir)
        if (data.platformServiceFee > 0) {
            EarningRow(
                label = "Biaya Layanan Platform",
                amount = data.platformServiceFee,
                icon = "🧾"
            )
            Text(
                "Ditanggung customer, bukan bagian pendapatan Anda.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
            )
            Spacer(Modifier.height(8.dp))
        }
        
        // Net earnings — BIG
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.primaryContainer,
            shape = RoundedCornerShape(12.dp)
        ) {
            Row(
                Modifier.padding(16.dp).fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        "PENDAPATAN BERSIH",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                    Text(
                        formatRupiah(data.estimatedNetEarnings),
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
        
        Spacer(Modifier.height(12.dp))
        
        // Education text
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            shape = RoundedCornerShape(8.dp)
        ) {
            Text(
                if (data.settlementModel == "per_km") {
                                    "💡 Harga jasa yang Anda tentukan 100% masuk ke penghasilan Anda. Komisi platform dihitung dari biaya perjalanan saja, tidak dari harga jasa. Biaya layanan platform ditanggung customer."
                                } else {
                    "💡 Komisi platform dihitung dari seluruh pool (setelah PPN & MDR)."
                },
                modifier = Modifier.padding(12.dp),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/** Label persentase komisi: tampilkan tanpa desimal utk angka bulat (20), dgn desimal bila perlu (0.5). */
private fun platformCommissionPctLabel(pct: Double): String {
    return if (pct % 1.0 == 0.0) pct.toInt().toString() else pct.toString()
}

@Composable
private fun EarningRow(
    label: String,
    amount: Long,
    icon: String = "",
    isDeduction: Boolean = false
) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (icon.isNotEmpty()) {
                Text(icon, fontSize = 14.sp)
                Spacer(Modifier.height(4.dp))
            }
            Text(label, style = MaterialTheme.typography.bodyMedium)
        }
        Text(
            if (isDeduction) "-${formatRupiah(amount)}" else formatRupiah(amount),
            style = MaterialTheme.typography.bodyMedium,
            color = if (isDeduction) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
        )
    }
}

private fun formatRupiah(amount: Long): String {
    return "Rp ${amount.toString().reversed().chunked(3).joinToString(".").reversed()}"
}