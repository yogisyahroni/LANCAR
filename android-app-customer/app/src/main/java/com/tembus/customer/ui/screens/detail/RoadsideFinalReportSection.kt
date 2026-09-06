package com.tembus.customer.ui.screens.detail

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.tembus.customer.data.model.RoadsideFinalReportResponse
import com.tembus.customer.ui.localization.CustomerText as Text
import java.text.NumberFormat
import java.util.Locale

@Composable
fun RoadsideFinalReportSection(
    data: RoadsideFinalReportResponse?,
    isLoading: Boolean,
    error: String?,
    onRetry: () -> Unit
) {
    if (data == null && !isLoading && error == null) return

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text("Laporan Akhir Teknisi", fontWeight = FontWeight.Bold)

            when {
                isLoading -> Text("Memuat bukti dan laporan akhir...")
                error != null -> {
                    Text(error, color = MaterialTheme.colorScheme.error)
                    androidx.compose.material3.TextButton(onClick = onRetry) {
                        Text("Coba lagi")
                    }
                }
                data != null -> {
                    val report = data.report
                    ReportRow("Kondisi awal", humanizeRoadsideValue(report.tireConditionBefore))
                    ReportRow("Kondisi akhir", humanizeRoadsideValue(report.tireConditionAfter))
                    report.serviceDurationMinutes?.let { ReportRow("Durasi pengerjaan", "$it menit") }
                    ReportRow(
                        "Material digunakan",
                        if (report.materialsUsedItems.isEmpty()) "Tidak ada material tambahan" else report.materialsUsedItems.joinToString { humanizeRoadsideValue(it) }
                    )
                    report.notes?.takeIf { it.isNotBlank() }?.let { ReportRow("Catatan teknisi", it) }

                    if (!report.tirePhotoBeforeUrl.isNullOrBlank() || !report.tirePhotoAfterUrl.isNullOrBlank()) {
                        HorizontalDivider()
                        Text("Bukti pekerjaan", fontWeight = FontWeight.SemiBold)
                        report.tirePhotoBeforeUrl?.takeIf { it.isNotBlank() }?.let { url ->
                            Text("Sebelum", style = MaterialTheme.typography.labelMedium)
                            AsyncImage(
                                model = url,
                                contentDescription = "Foto kondisi ban sebelum perbaikan",
                                modifier = Modifier.fillMaxWidth().height(160.dp),
                                contentScale = ContentScale.Crop
                            )
                        }
                        report.tirePhotoAfterUrl?.takeIf { it.isNotBlank() }?.let { url ->
                            Text("Sesudah", style = MaterialTheme.typography.labelMedium)
                            AsyncImage(
                                model = url,
                                contentDescription = "Foto kondisi ban setelah perbaikan",
                                modifier = Modifier.fillMaxWidth().height(160.dp),
                                contentScale = ContentScale.Crop
                            )
                        }
                    }

                    HorizontalDivider()
                    val approved = data.approvedAdjustment
                    if (approved == null) {
                        Text("Tidak ada penyesuaian harga yang disetujui.")
                    } else {
                        Text("Penyesuaian Harga Disetujui", fontWeight = FontWeight.SemiBold)
                        approved.items.forEach { item ->
                            ReportRow(
                                "${item.label} · ${item.quantity}x",
                                rupiah(item.totalIdr)
                            )
                        }
                        ReportRow("Harga awal", rupiah(approved.originalTotalIdr))
                        ReportRow("Tambahan disetujui", "+${rupiah(approved.approvedDeltaIdr)}")
                        ReportRow("Total setelah persetujuan", rupiah(approved.proposedTotalIdr), bold = true)
                    }
                }
            }
        }
    }
}

@Composable
private fun ReportRow(label: String, value: String, bold: Boolean = false) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.padding(horizontal = 4.dp))
        Text(value, fontWeight = if (bold) FontWeight.Bold else FontWeight.Medium)
    }
}

private fun rupiah(value: Long): String =
    "Rp ${NumberFormat.getNumberInstance(Locale("id", "ID")).format(value)}"

internal fun humanizeRoadsideValue(value: String?): String = value
    ?.trim()
    ?.replace('_', ' ')
    ?.split(' ')
    ?.filter { it.isNotBlank() }
    ?.joinToString(" ") { word -> word.replaceFirstChar { it.uppercaseChar() } }
    ?.ifBlank { "-" }
    ?: "-"
