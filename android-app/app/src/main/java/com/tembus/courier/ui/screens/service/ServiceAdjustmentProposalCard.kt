package com.tembus.courier.ui.screens.service

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.tembus.courier.data.model.ServiceAdjustmentItem
import com.tembus.courier.ui.theme.TembusRadius
import java.text.NumberFormat
import java.util.Locale

internal fun serviceAdjustmentDraftTotal(items: List<ServiceAdjustmentItem>): Long =
    items.fold(0L) { total, item -> total + item.totalIdr }

internal fun isValidServiceAdjustmentDraft(reason: String, items: List<ServiceAdjustmentItem>): Boolean =
    reason.trim().length in 5..500 && items.isNotEmpty() &&
        items.all { it.quantity in 1..100 && it.unitPriceIdr > 0 && it.totalIdr > 0 } &&
        serviceAdjustmentDraftTotal(items) in 1..10_000_000

private fun idr(value: Long): String = "Rp ${NumberFormat.getNumberInstance(Locale("id", "ID")).format(value)}"

@Composable
fun ServiceAdjustmentProposalCard(
    isSubmitting: Boolean,
    feedbackMessage: String?,
    feedbackError: String?,
    onSubmit: (String, List<ServiceAdjustmentItem>) -> Unit
) {
    var reason by remember { mutableStateOf("") }
    var itemType by remember { mutableStateOf("material") }
    var label by remember { mutableStateOf("") }
    var quantity by remember { mutableStateOf("1") }
    var unitPrice by remember { mutableStateOf("") }
    var items by remember { mutableStateOf<List<ServiceAdjustmentItem>>(emptyList()) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.25f)),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.3f))
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Penyesuaian Harga di Lokasi", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            Text(
                "Gunakan hanya jika hasil inspeksi membutuhkan material atau pekerjaan tambahan. Harga customer belum berubah sampai disetujui.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it.take(500) },
                label = { Text("Alasan hasil inspeksi") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = itemType == "material", onClick = { itemType = "material" }, label = { Text("Material") })
                FilterChip(selected = itemType == "labor", onClick = { itemType = "labor" }, label = { Text("Jasa") })
            }
            OutlinedTextField(
                value = label,
                onValueChange = { label = it.take(80) },
                label = { Text("Nama item / pekerjaan") },
                modifier = Modifier.fillMaxWidth()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = quantity,
                    onValueChange = { quantity = it.filter(Char::isDigit).take(3) },
                    label = { Text("Qty") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(0.35f)
                )
                OutlinedTextField(
                    value = unitPrice,
                    onValueChange = { unitPrice = it.filter(Char::isDigit).take(9) },
                    label = { Text("Harga/unit") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(0.65f)
                )
            }
            val qty = quantity.toLongOrNull() ?: 0
            val price = unitPrice.toLongOrNull() ?: 0
            val canAdd = label.trim().isNotEmpty() && qty in 1..100 && price > 0 && price <= 10_000_000
            TextButton(
                enabled = canAdd && items.size < 30,
                onClick = {
                    val normalized = label.trim().lowercase()
                        .replace(Regex("[^a-z0-9]+"), "_")
                        .trim('_')
                        .take(32)
                        .ifBlank { "item" }
                    items = items + ServiceAdjustmentItem(
                        code = "${itemType}_${items.size + 1}_$normalized",
                        label = label.trim(),
                        type = itemType,
                        quantity = qty,
                        unitPriceIdr = price,
                        totalIdr = qty * price
                    )
                    label = ""
                    quantity = "1"
                    unitPrice = ""
                }
            ) { Text("+ Tambah ke adjustment") }

            if (items.isNotEmpty()) {
                HorizontalDivider()
                items.forEachIndexed { index, item ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) {
                            Text(item.label, fontWeight = FontWeight.Medium)
                            Text("${item.quantity} × ${idr(item.unitPriceIdr)} · ${if (item.type == "labor") "Jasa" else "Material"}", style = MaterialTheme.typography.bodySmall)
                        }
                        Column {
                            Text(idr(item.totalIdr), fontWeight = FontWeight.SemiBold)
                            TextButton(onClick = { items = items.filterIndexed { i, _ -> i != index } }) { Text("Hapus") }
                        }
                    }
                }
                HorizontalDivider()
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Total tambahan", fontWeight = FontWeight.Bold)
                    Text(idr(serviceAdjustmentDraftTotal(items)), fontWeight = FontWeight.Bold)
                }
            }

            feedbackMessage?.let { Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }
            feedbackError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            Spacer(Modifier.height(2.dp))
            Button(
                enabled = !isSubmitting && isValidServiceAdjustmentDraft(reason, items),
                onClick = { onSubmit(reason.trim(), items) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (isSubmitting) "Mengirim..." else "Kirim untuk Persetujuan Customer", fontWeight = FontWeight.Bold)
            }
        }
    }
}
