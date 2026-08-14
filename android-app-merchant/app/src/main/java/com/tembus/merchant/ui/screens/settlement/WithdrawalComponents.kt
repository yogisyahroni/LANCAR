package com.tembus.merchant.ui.screens.settlement

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.MerchantWithdrawalRecord
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.theme.GreenText
import com.tembus.merchant.ui.theme.Primary

// M7: Dialog ajukan pencairan saldo merchant.
@Composable
fun WithdrawalDialog(
    availableIdr: Long,
    prefillBankName: String,
    prefillAccount: String,
    prefillHolder: String,
    isRequesting: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (amountIdr: Long, bankName: String, accountNumber: String, holder: String) -> Unit
) {
    var amountText by remember { mutableStateOf("") }
    var bankName by remember { mutableStateOf(prefillBankName) }
    var account by remember { mutableStateOf(prefillAccount) }
    var holder by remember { mutableStateOf(prefillHolder) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            Button(
                onClick = {
                    val amount = amountText.toLongOrNull() ?: 0
                    when {
                        amount <= 0 -> error = "Masukkan nominal penarikan"
                        amount < 10_000 -> error = "Minimal penarikan Rp 10.000"
                        amount > availableIdr -> error = "Melebihi saldo tersedia (${Format.rupiah(availableIdr)})"
                        bankName.isBlank() || account.isBlank() || holder.isBlank() -> error = "Data rekening wajib lengkap"
                        else -> onConfirm(amount, bankName.trim(), account.trim(), holder.trim())
                    }
                },
                enabled = !isRequesting,
                colors = ButtonDefaults.buttonColors(containerColor = Primary)
            ) { Text(if (isRequesting) "Memproses..." else "Ajukan") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Batal") } },
        title = { Text("Ajukan Pencairan", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "Saldo tersedia: ${Format.rupiah(availableIdr)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = GreenText,
                    fontWeight = FontWeight.SemiBold
                )
                OutlinedTextField(
                    value = amountText,
                    onValueChange = { amountText = it.filter { c -> c.isDigit() }.take(12) },
                    label = { Text("Nominal (Rp)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = bankName,
                    onValueChange = { bankName = it },
                    label = { Text("Nama Bank") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = account,
                    onValueChange = { account = it.filter { c -> c.isDigit() }.take(18) },
                    label = { Text("Nomor Rekening") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = holder,
                    onValueChange = { holder = it },
                    label = { Text("Nama Pemilik Rekening") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    )
}

// M7: baris riwayat permintaan pencairan.
@Composable
fun WithdrawalRow(record: MerchantWithdrawalRecord) {
    val (statusText, statusColor, bgColor) = when (record.status) {
        "completed" -> Triple("CAIR", GreenText, GreenText.copy(alpha = 0.10f))
        "pending" -> Triple("MENUNGGU", Color(0xFFD97706), Color(0xFFD97706).copy(alpha = 0.10f))
        "processing" -> Triple("PROSES", Color(0xFF2563EB), Color(0xFF2563EB).copy(alpha = 0.10f))
        "rejected", "failed" -> Triple(record.status.uppercase(), MaterialTheme.colorScheme.error, MaterialTheme.colorScheme.error.copy(alpha = 0.10f))
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
                text = Format.rupiah(record.amountIdr),
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
            text = "${record.bankName} • ${record.bankAccountNumber}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (!record.createdAt.isNullOrBlank()) {
            Text(
                text = Format.dateTime(record.createdAt),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (!record.rejectionReason.isNullOrBlank()) {
            Text(
                text = "Ditolak: ${record.rejectionReason}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error
            )
        }
    }
}
