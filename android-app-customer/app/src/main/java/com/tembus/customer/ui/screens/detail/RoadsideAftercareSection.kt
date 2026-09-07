package com.tembus.customer.ui.screens.detail

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.tembus.customer.data.model.*
import com.tembus.customer.ui.localization.CustomerText as Text
import java.text.NumberFormat
import java.util.Locale

internal fun isRoadsideFinalStatus(status: String): Boolean =
    status.lowercase() in setOf("delivered", "completed")

internal fun collectableRoadsideAdjustments(items: List<ServiceAdjustment>): List<ServiceAdjustment> =
    items.filter { it.status == "approved" && it.financialState == "pending_collection" && it.approvedDeltaIdr > 0 }

private fun roadsideIDR(value: Long): String =
    "Rp ${NumberFormat.getNumberInstance(Locale("id", "ID")).format(value)}"

/** Collection remains available before delivery; claims and ratings require final proof. */
@Composable
fun RoadsideAftercareSection(
    orderId: String,
    status: String,
    adjustments: List<ServiceAdjustment>,
    onRefresh: () -> Unit,
    reportRequested: Boolean = false,
    viewModel: RoadsideAftercareViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    var reportOpen by remember(orderId) { mutableStateOf(false) }
    var claimOpen by remember(orderId) { mutableStateOf(false) }
    var ratingOpen by remember(orderId) { mutableStateOf(false) }
    var issueType by remember(orderId) { mutableStateOf("service_quality") }
    var description by remember(orderId) { mutableStateOf("") }
    var overall by remember(orderId) { mutableIntStateOf(0) }
    var technician by remember(orderId) { mutableIntStateOf(0) }
    var comment by remember(orderId) { mutableStateOf("") }

    LaunchedEffect(orderId) { viewModel.resetForOrder(orderId) }
    LaunchedEffect(reportRequested) {
        if (reportRequested && isRoadsideFinalStatus(status)) {
            reportOpen = true
            viewModel.load(orderId)
        }
    }
    val final = isRoadsideFinalStatus(status)
    val due = collectableRoadsideAdjustments(adjustments)

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (due.isNotEmpty() || adjustments.any { it.status == "approved" }) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Pembayaran Tambahan", fontWeight = FontWeight.Bold)
                    Text("Persetujuan harga bukan bukti pembayaran. Bayar hanya nominal yang disetujui.",
                        style = MaterialTheme.typography.bodySmall)
                    adjustments.filter { it.status == "approved" }.forEach { adjustment ->
                        HorizontalDivider()
                        Text(adjustment.reason, fontWeight = FontWeight.Medium)
                        Text(roadsideIDR(adjustment.approvedDeltaIdr))
                        if (adjustment.financialState == "collected") {
                            Text("Sudah terverifikasi", color = MaterialTheme.colorScheme.primary)
                        } else if (adjustment.financialState == "pending_collection") {
                            Button(onClick = { viewModel.collect(adjustment.id, onRefresh) },
                                enabled = !state.isSubmitting && state.payment == null) {
                                Text("Bayar tambahan ${roadsideIDR(adjustment.approvedDeltaIdr)}")
                            }
                        } else {
                            Text("Status: ${adjustment.financialState}. Hubungi bantuan jika diperlukan.")
                        }
                    }
                }
            }
        }

        if (state.payment != null) {
            val payment = state.payment!!
            AlertDialog(onDismissRequest = viewModel::closePayment,
                title = { Text("Pembayaran tambahan") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(roadsideIDR(payment.amountIdr), fontWeight = FontWeight.Bold)
                        Text("Referensi: ${payment.paymentNumber}", style = MaterialTheme.typography.bodySmall)
                        if (payment.status == "paid" || payment.status == "settled") {
                            Text("Pembayaran telah diverifikasi oleh penyedia.")
                        } else {
                            payment.qrCodeUrl?.takeIf { it.isNotBlank() }?.let { url ->
                                AsyncImage(model = url, contentDescription = "QRIS pembayaran tambahan",
                                    modifier = Modifier.fillMaxWidth().height(240.dp), contentScale = ContentScale.Fit)
                            }
                            if (payment.qrCodeUrl.isNullOrBlank()) {
                                Text("QR belum tersedia. Jangan melakukan pembayaran sebelum QR resmi ditampilkan.")
                            }
                            Text("Jangan membayar dua kali. Jika pembayaran sudah dilakukan, periksa status sebelum mencoba lagi.",
                                style = MaterialTheme.typography.bodySmall)
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { viewModel.closePayment(); onRefresh() }) { Text("Periksa status") }
                },
                dismissButton = { TextButton(onClick = viewModel::closePayment) { Text("Tutup") } })
        }

        if (final) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Laporan dan Layanan Purnajual", fontWeight = FontWeight.Bold)
                    OutlinedButton(onClick = { reportOpen = !reportOpen; if (reportOpen) viewModel.load(orderId) },
                        modifier = Modifier.fillMaxWidth()) {
                        Text(if (reportOpen) "Sembunyikan laporan" else "Lihat laporan akhir teknisi")
                    }
                    if (reportOpen) {
                        RoadsideFinalReportSection(state.report, state.isLoading, state.error) { viewModel.load(orderId) }
                    }
                    HorizontalDivider()
                    Text("Klaim layanan", fontWeight = FontWeight.SemiBold)
                    Text("Klaim akan ditautkan ke bukti pekerjaan yang tersimpan. Pengajuan garansi akan diperiksa sesuai ketentuan layanan; pengajuan tidak otomatis berarti garansi disetujui.",
                        style = MaterialTheme.typography.bodySmall)
                    if (state.claim != null) {
                        Text("Klaim tercatat: ${state.claim!!.id}")
                        Text("Status: ${state.claim!!.status}")
                    }
                    OutlinedButton(onClick = { claimOpen = !claimOpen; if (claimOpen && state.report == null) viewModel.load(orderId) },
                        modifier = Modifier.fillMaxWidth()) { Text(if (claimOpen) "Tutup formulir klaim" else "Ajukan klaim layanan") }
                    if (claimOpen) {
                        RoadsideIssuePicker(issueType) { issueType = it }
                        OutlinedTextField(value = description, onValueChange = { description = it.take(2000) },
                            label = { Text("Jelaskan masalah") }, minLines = 3,
                            supportingText = { Text("${description.trim().length}/2000 · minimal 10 karakter") },
                            modifier = Modifier.fillMaxWidth())
                        Button(onClick = {
                            viewModel.submitClaim(RoadsideClaimRequest(orderId, issueType, description.trim()))
                        }, enabled = !state.isSubmitting && !state.isLoading && state.report != null && description.trim().length in 10..2000,
                            modifier = Modifier.fillMaxWidth()) { Text("Kirim klaim") }
                    }
                    HorizontalDivider()
                    Text("Penilaian layanan", fontWeight = FontWeight.SemiBold)
                    if (state.rating != null) {
                        Text("Penilaian tersimpan: ${state.rating!!.id}")
                        Text("Keseluruhan: ${state.rating!!.overallRating}/5 · Teknisi: ${state.rating!!.technicianQualityRating}/5")
                    } else {
                        OutlinedButton(onClick = { ratingOpen = !ratingOpen; if (ratingOpen && state.report == null) viewModel.load(orderId) },
                            modifier = Modifier.fillMaxWidth()) { Text(if (ratingOpen) "Tutup penilaian" else "Beri penilaian") }
                        if (ratingOpen) {
                            RoadsideRatingSelector("Pengalaman layanan keseluruhan", overall) { overall = it }
                            RoadsideRatingSelector("Kualitas pekerjaan teknisi", technician) { technician = it }
                            OutlinedTextField(value = comment, onValueChange = { comment = it.take(500) },
                                label = { Text("Komentar (opsional)") }, minLines = 2,
                                supportingText = { Text("${comment.length}/500") }, modifier = Modifier.fillMaxWidth())
                            Button(onClick = {
                                viewModel.submitRating(RoadsideRatingRequest(orderId, overall, technician, comment.trim()))
                            }, enabled = !state.isSubmitting && !state.isLoading && state.report != null && overall in 1..5 && technician in 1..5,
                                modifier = Modifier.fillMaxWidth()) { Text("Kirim penilaian") }
                        }
                    }
                }
            }
        }
        state.message?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
        if (state.error != null && !reportOpen) {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
        }
        if (state.isSubmitting) LinearProgressIndicator(Modifier.fillMaxWidth())
    }
}

@Composable
private fun RoadsideIssuePicker(value: String, onChange: (String) -> Unit) {
    val options = listOf("service_quality" to "Kualitas pekerjaan", "warranty" to "Permohonan garansi",
        "damage" to "Kerusakan", "other" to "Lainnya")
    Column {
        Text("Jenis masalah", style = MaterialTheme.typography.labelLarge)
        options.forEach { (code, label) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                RadioButton(selected = value == code, onClick = { onChange(code) })
                Text(label)
            }
        }
    }
}

@Composable
private fun RoadsideRatingSelector(label: String, value: Int, onChange: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            (1..5).forEach { score ->
                OutlinedButton(onClick = { onChange(score) },
                    modifier = Modifier.weight(1f), contentPadding = PaddingValues(0.dp),
                    colors = ButtonDefaults.outlinedButtonColors(containerColor =
                        if (score == value) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface)) {
                    Text("$score")
                }
            }
        }
        Text(if (value == 0) "Belum dipilih" else "$value dari 5", style = MaterialTheme.typography.bodySmall)
    }
}
