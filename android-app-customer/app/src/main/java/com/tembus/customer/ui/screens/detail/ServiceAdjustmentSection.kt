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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tembus.customer.data.model.ServiceAdjustment
import com.tembus.customer.ui.theme.TembusRadius
import java.text.NumberFormat
import java.util.Locale

internal fun pendingServiceAdjustment(adjustments: List<ServiceAdjustment>): ServiceAdjustment? =
    adjustments.firstOrNull { it.status.equals("pending", ignoreCase = true) }

private fun idr(value: Long): String = "Rp ${NumberFormat.getNumberInstance(Locale("id", "ID")).format(value)}"

@Composable
fun ServiceAdjustmentSection(
    adjustments: List<ServiceAdjustment>,
    isSubmitting: Boolean,
    onApprove: (String) -> Unit,
    onReject: (String, String) -> Unit
) {
    val pending = pendingServiceAdjustment(adjustments) ?: return
    var confirmApproval by remember(pending.id) { mutableStateOf(false) }
    var rejectDialog by remember(pending.id) { mutableStateOf(false) }
    var rejectionReason by remember(pending.id) { mutableStateOf("") }

    if (confirmApproval) {
        AlertDialog(
            onDismissRequest = { if (!isSubmitting) confirmApproval = false },
            title = { Text("Setujui tambahan biaya?") },
            text = {
                Text("Total pesanan akan berubah dari ${idr(pending.originalTotalIdr)} menjadi ${idr(pending.proposedTotalIdr)}. Persetujuan ini dicatat sebagai persetujuan harga.")
            },
            confirmButton = {
                TextButton(
                    enabled = !isSubmitting,
                    onClick = {
                        confirmApproval = false
                        onApprove(pending.id)
                    }
                ) { Text("Setujui", fontWeight = FontWeight.Bold) }
            },
            dismissButton = {
                TextButton(enabled = !isSubmitting, onClick = { confirmApproval = false }) { Text("Batal") }
            }
        )
    }

    if (rejectDialog) {
        AlertDialog(
            onDismissRequest = { if (!isSubmitting) rejectDialog = false },
            title = { Text("Tolak penyesuaian harga") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Tambahkan alasan singkat agar teknisi tahu kenapa biaya tambahan belum disetujui.")
                    OutlinedTextField(
                        value = rejectionReason,
                        onValueChange = { rejectionReason = it.take(500) },
                        label = { Text("Alasan penolakan") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2
                    )
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !isSubmitting && rejectionReason.trim().length >= 3,
                    onClick = {
                        val reason = rejectionReason.trim()
                        rejectDialog = false
                        onReject(pending.id, reason)
                    }
                ) { Text("Tolak", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold) }
            },
            dismissButton = {
                TextButton(enabled = !isSubmitting, onClick = { rejectDialog = false }) { Text("Batal") }
            }
        )
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.35f)),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.secondary.copy(alpha = 0.35f))
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Persetujuan Biaya Tambahan", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            Text(pending.reason, color = MaterialTheme.colorScheme.onSurfaceVariant)
            HorizontalDivider()
            pending.items.forEach { item ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(Modifier.weight(1f)) {
                        Text(item.label, fontWeight = FontWeight.Medium)
                        Text("${item.quantity} × ${idr(item.unitPriceIdr)} · ${if (item.type == "labor") "Jasa" else "Material"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(idr(item.totalIdr), fontWeight = FontWeight.SemiBold)
                }
            }
            HorizontalDivider()
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Harga awal")
                Text(idr(pending.originalTotalIdr))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Tambahan", fontWeight = FontWeight.Bold)
                Text("+${idr(pending.deltaIdr)}", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Total setelah disetujui", fontWeight = FontWeight.Bold)
                Text(idr(pending.proposedTotalIdr), fontWeight = FontWeight.Bold)
            }
            Text(
                "Harga pesanan belum berubah sampai Anda menekan Setujui. Backend tetap menjadi sumber harga final.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(2.dp))
            Button(
                onClick = { confirmApproval = true },
                enabled = !isSubmitting,
                modifier = Modifier.fillMaxWidth()
            ) { Text(if (isSubmitting) "Memproses..." else "Setujui Tambahan Biaya", fontWeight = FontWeight.Bold) }
            OutlinedButton(
                onClick = { rejectDialog = true },
                enabled = !isSubmitting,
                modifier = Modifier.fillMaxWidth()
            ) { Text("Tolak / Minta Penjelasan") }
        }
    }
}
