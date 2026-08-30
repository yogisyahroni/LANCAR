package com.tembus.merchant.ui.screens.settlement

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.MerchantWithdrawalRequest
import com.tembus.merchant.data.model.SettlementRecord
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale
import java.text.NumberFormat
import java.util.Locale

@Composable
fun SettlementZipScreen(
    onBack: () -> Unit,
    viewModel: SettlementViewModel = appViewModel { SettlementViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()
    var showWithdrawDialog by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(PrimaryPale)) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali")
            }
            Text("Payout History", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            when {
                state.isLoading -> CircularProgressIndicator(color = Primary, modifier = Modifier.align(Alignment.CenterHorizontally))
                state.errorMessage != null -> {
                    Text(state.errorMessage!!, color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = viewModel::load, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                        Text("Coba Lagi")
                    }
                }
                state.summary != null -> {
                    val summary = state.summary!!
                    SettlementAmountCard("Available balance", summary.availableIdr)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        SettlementAmountCard("Paid out", summary.totalIdr, Modifier.weight(1f))
                        SettlementAmountCard("On hold", summary.holdingIdr, Modifier.weight(1f))
                    }
                    Button(
                        onClick = { showWithdrawDialog = true },
                        enabled = summary.availableIdr >= 10_000 && !state.isRequesting && state.merchant?.bankName != null,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Accent)
                    ) {
                        if (state.isRequesting) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        else Text("REQUEST PAYOUT")
                    }
                    state.requestError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    if (state.requestSuccess) {
                        Text("Payout request submitted.", color = Color(0xFF15803D))
                        LaunchedEffect(Unit) { viewModel.clearRequestState() }
                    }
                    Text("Payout history", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    if (summary.records.isEmpty() && state.withdrawals.isEmpty()) {
                        Text("Belum ada transaksi payout dari backend.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        summary.records.forEach { SettlementRecordCard(it) }
                        state.withdrawals.forEach { withdrawal ->
                            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), modifier = Modifier.fillMaxWidth()) {
                                Column(Modifier.padding(12.dp)) {
                                    Text("Withdrawal request", fontWeight = FontWeight.SemiBold)
                                    Text(formatIdr(withdrawal.amountIdr))
                                    Text(withdrawal.status, style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showWithdrawDialog && state.summary != null && state.merchant != null) {
        WithdrawalDialog(
            maxAmount = state.summary!!.availableIdr,
            bankName = state.merchant!!.bankName.orEmpty(),
            accountNumber = state.merchant!!.bankAccountNumber.orEmpty(),
            holder = state.merchant!!.bankAccountHolder.orEmpty(),
            onDismiss = { showWithdrawDialog = false },
            onConfirm = { amount ->
                viewModel.requestWithdrawal(amount, state.merchant!!.bankName.orEmpty(),
                    state.merchant!!.bankAccountNumber.orEmpty(), state.merchant!!.bankAccountHolder.orEmpty())
                showWithdrawDialog = false
            }
        )
    }
}

@Composable
private fun SettlementAmountCard(label: String, amount: Long, modifier: Modifier = Modifier) {
    Card(modifier = modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(10.dp)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(formatIdr(amount), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun SettlementRecordCard(record: SettlementRecord) {
    Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.AccountBalance, contentDescription = null, tint = Primary)
            Spacer(Modifier.size(10.dp))
            Column(Modifier.weight(1f)) {
                Text(formatIdr(record.netPayoutIdr), fontWeight = FontWeight.SemiBold)
                Text(record.createdAt.take(10), style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(record.status, style = MaterialTheme.typography.labelMedium, color = Primary)
        }
    }
}

@Composable
private fun WithdrawalDialog(
    maxAmount: Long,
    bankName: String,
    accountNumber: String,
    holder: String,
    onDismiss: () -> Unit,
    onConfirm: (Long) -> Unit
) {
    var amount by remember { mutableStateOf("") }
    val parsedAmount = amount.filter(Char::isDigit).toLongOrNull() ?: 0L
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Request payout") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("$bankName • $accountNumber • $holder", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it.filter(Char::isDigit).take(12) },
                    label = { Text("Amount (max ${formatIdr(maxAmount)})") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(parsedAmount) }, enabled = parsedAmount in 10_000..maxAmount) { Text("Submit") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

private fun formatIdr(amount: Long): String =
    NumberFormat.getCurrencyInstance(Locale("id", "ID")).apply { maximumFractionDigits = 0 }.format(amount)
