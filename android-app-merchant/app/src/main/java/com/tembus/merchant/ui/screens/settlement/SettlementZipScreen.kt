package com.tembus.merchant.ui.screens.settlement

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.data.model.MerchantFinanceStatement
import com.tembus.merchant.data.model.MerchantStatementTotals
import com.tembus.merchant.data.model.MerchantWithdrawalRecord
import com.tembus.merchant.data.model.SalesReportSummary
import com.tembus.merchant.data.model.SettlementRecord
import com.tembus.merchant.data.model.SettlementSummary
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.localization.MerchantText as Text
import com.tembus.merchant.ui.localization.MerchantTextCatalog
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.AccentSoft
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryDark
import com.tembus.merchant.ui.theme.PrimaryPale
import com.tembus.merchant.ui.theme.PrimarySoft
import kotlinx.coroutines.launch
import java.util.Locale

/**
 * Merchant finance surface aligned to the Figma "Keuangan & Settlement"
 * frame. Amounts and statuses are read from merchant-service projections.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettlementZipScreen(
    onBack: (() -> Unit)? = null,
    onOpenNotifications: (() -> Unit)? = null,
    onOpenProfile: (() -> Unit)? = null,
    onOpenBankSettings: (() -> Unit)? = null,
    viewModel: SettlementViewModel = appViewModel { SettlementViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()
    var showWithdrawDialog by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    PullToRefreshBox(
        isRefreshing = state.isLoading && state.summary != null,
        onRefresh = viewModel::load,
        modifier = Modifier.fillMaxSize()
    ) {
        Column(Modifier.fillMaxSize().background(PrimaryPale)) {
            if (onBack != null) {
                Row(
                    Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = MerchantTextCatalog.translate("Kembali"))
                    }
                    Text("Keuangan", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                }
            }
            when {
                state.isLoading && state.summary == null -> FinanceLoading()
                state.errorMessage != null && state.summary == null -> FinanceError(state.errorMessage!!, viewModel::load)
                else -> FinanceContent(
                    merchant = state.merchant,
                    summary = state.summary,
                    statement = state.financeStatement,
                    dailySales = state.dailySales,
                    withdrawals = state.withdrawals,
                    listState = listState,
                    onOpenNotifications = onOpenNotifications,
                    onOpenProfile = onOpenProfile,
                    onOpenBankSettings = onOpenBankSettings,
                    onWithdraw = { showWithdrawDialog = true },
                    onOpenWithdrawalHistory = { scope.launch { listState.animateScrollToItem(6) } },
                    onRetry = viewModel::load
                )
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
                viewModel.requestWithdrawal(amount, state.merchant!!.bankName.orEmpty(), state.merchant!!.bankAccountNumber.orEmpty(), state.merchant!!.bankAccountHolder.orEmpty())
                showWithdrawDialog = false
            }
        )
    }
}

@Composable
private fun FinanceLoading() {
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        CircularProgressIndicator(color = Primary)
        Spacer(Modifier.height(12.dp))
        Text("Memuat data keuangan…", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun FinanceError(message: String, onRetry: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Icon(Icons.Filled.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(44.dp))
        Spacer(Modifier.height(12.dp))
        Text(message, color = MaterialTheme.colorScheme.error)
        Spacer(Modifier.height(12.dp))
        OutlinedButton(onClick = onRetry) { Text("Coba lagi") }
    }
}

@Composable
private fun FinanceContent(
    merchant: Merchant?,
    summary: SettlementSummary?,
    statement: MerchantFinanceStatement?,
    dailySales: SalesReportSummary?,
    withdrawals: List<MerchantWithdrawalRecord>,
    listState: LazyListState,
    onOpenNotifications: (() -> Unit)?,
    onOpenProfile: (() -> Unit)?,
    onOpenBankSettings: (() -> Unit)?,
    onWithdraw: () -> Unit,
    onOpenWithdrawalHistory: () -> Unit,
    onRetry: () -> Unit
) {
    val payoutEnabled = summary != null && summary.availableIdr >= 10_000 && merchant?.bankAccountVerified == true && !merchant.bankName.isNullOrBlank() && !merchant.bankAccountNumber.isNullOrBlank() && !merchant.bankAccountHolder.isNullOrBlank()
    val totals = statement?.totals?.firstOrNull()
    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            FinanceHeader(merchant, onOpenNotifications, onOpenProfile)
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text("Keuangan & Pencairan", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("Kelola omzet, bagi hasil, dan penarikan instan.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item {
            WalletCard(summary?.availableIdr, merchant?.bankName, payoutEnabled, onWithdraw, onOpenWithdrawalHistory)
        }
        item { AutomaticPayoutCard(merchant, onOpenBankSettings) }
        item { DailyFinanceCard(dailySales, totals, statement) }
        item { TaxCard(summary?.tax) }
        item { WithdrawalHistoryCard(withdrawals, summary?.records.orEmpty(), onRetry) }
        if (!statement?.discrepancies.isNullOrEmpty()) item { DiscrepancyCard(statement!!) }
        item { Spacer(Modifier.navigationBarsPadding().height(1.dp)) }
    }
}

@Composable
private fun FinanceHeader(merchant: Merchant?, onOpenNotifications: (() -> Unit)?, onOpenProfile: (() -> Unit)?) {
    val name = merchant?.namaToko?.takeIf { it.isNotBlank() } ?: "Merchant"
    val address = merchant?.alamat?.takeIf { it.isNotBlank() } ?: "Alamat toko belum tersedia"
    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Surface(shape = CircleShape, color = PrimaryDark, modifier = Modifier.size(42.dp)) {
            Box(contentAlignment = Alignment.Center) { Text(name.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium) }
        }
        Spacer(Modifier.size(10.dp))
        Column(Modifier.weight(1f)) {
            Text(name, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(shape = RoundedCornerShape(50), color = PrimarySoft) {
                    Text("MITRA JUARA", color = Primary, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
                }
                Spacer(Modifier.size(6.dp))
                Text(address, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
            }
        }
        Surface(shape = RoundedCornerShape(50), color = if (merchant?.isOpen == true) PrimarySoft else MaterialTheme.colorScheme.surfaceVariant) {
            Text(if (merchant?.isOpen == true) "BUKA" else "TUTUP", color = if (merchant?.isOpen == true) Primary else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp))
        }
        IconButton(onClick = { onOpenNotifications?.invoke() }, enabled = onOpenNotifications != null) {
            Icon(Icons.Filled.NotificationsNone, contentDescription = MerchantTextCatalog.translate("Notifications"), tint = PrimaryDark)
        }
        if (onOpenProfile != null) IconButton(onClick = onOpenProfile) { Icon(Icons.Filled.Person, contentDescription = "Profil", tint = PrimaryDark) }
    }
}

@Composable
private fun WalletCard(availableIdr: Long?, bankName: String?, payoutEnabled: Boolean, onWithdraw: () -> Unit, onHistory: () -> Unit) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = PrimaryDark), shape = RoundedCornerShape(24.dp)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Surface(shape = RoundedCornerShape(50), color = Color.White.copy(alpha = 0.12f)) {
                    Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.AccountBalanceWallet, contentDescription = null, tint = Color.White, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.size(5.dp))
                        Text("DOMPET MERCHANT TEMBUS", color = Color.White, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                }
                Text("BI Regulated", color = Color.White.copy(alpha = 0.75f), style = MaterialTheme.typography.labelSmall)
            }
            Text("SALDO YANG BISA DICAIRKAN", color = Color.White.copy(alpha = 0.75f), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
            Text(availableIdr?.let(Format::rupiah) ?: "Belum tersedia", color = Color.White, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Lock, contentDescription = null, tint = Color.White.copy(alpha = 0.75f), modifier = Modifier.size(15.dp))
                Spacer(Modifier.size(5.dp))
                Text("Dana diproses melalui rekening pencairan yang sudah diverifikasi", color = Color.White.copy(alpha = 0.75f), style = MaterialTheme.typography.bodySmall)
            }
            Button(onClick = onWithdraw, enabled = payoutEnabled, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Color.White, disabledContainerColor = Color.White.copy(alpha = 0.14f), disabledContentColor = Color.White.copy(alpha = 0.55f)), shape = RoundedCornerShape(50)) {
                Icon(Icons.Filled.Wallet, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.size(7.dp))
                Text(if (payoutEnabled) "Tarik dana sekarang" else "Pencairan belum tersedia")
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(onClick = onHistory, modifier = Modifier.weight(1f), colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White), border = BorderStroke(1.dp, Color.White.copy(alpha = 0.22f)), shape = RoundedCornerShape(50)) {
                    Icon(Icons.Filled.History, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.size(6.dp))
                    Text("Riwayat Penarikan")
                }
                Text(bankName?.takeIf { it.isNotBlank() } ?: "Rekening belum terhubung", color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 4.dp))
            }
        }
    }
}

@Composable
private fun AutomaticPayoutCard(merchant: Merchant?, onOpenBankSettings: (() -> Unit)?) {
    val schedule = when (merchant?.payoutSchedule?.lowercase(Locale.US)) { "weekly" -> "Mingguan"; "monthly" -> "Bulanan"; else -> "Harian" }
    val account = merchant?.bankName?.takeIf { it.isNotBlank() }?.let { "$it • ${maskAccount(merchant.bankAccountNumber.orEmpty())}" } ?: "Rekening pencairan belum terhubung"
    Card(modifier = Modifier.fillMaxWidth().then(if (onOpenBankSettings != null) Modifier.clickable(onClick = onOpenBankSettings) else Modifier), colors = CardDefaults.cardColors(containerColor = PrimarySoft), shape = RoundedCornerShape(16.dp)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = CircleShape, color = Color(0xFFBCEBCF), modifier = Modifier.size(38.dp)) { Icon(Icons.Filled.CalendarToday, contentDescription = null, tint = Primary, modifier = Modifier.padding(10.dp)) }
            Spacer(Modifier.size(10.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Pencairan otomatis terjadwal", fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(shape = RoundedCornerShape(50), color = Color.White.copy(alpha = 0.65f)) { Text(schedule, color = Primary, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp)) }
                    Spacer(Modifier.size(7.dp))
                    Text("$account. Pencairan mengikuti pengaturan rekening Anda.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            if (onOpenBankSettings != null) Icon(Icons.Filled.ChevronRight, contentDescription = "Pengaturan rekening", tint = Primary)
        }
    }
}

@Composable
private fun DailyFinanceCard(dailySales: SalesReportSummary?, totals: MerchantStatementTotals?, statement: MerchantFinanceStatement?) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text("Rincian transaksi hari ini", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("Pesanan selesai dan ringkasan keuangan terbaru", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                }
                Surface(shape = RoundedCornerShape(50), color = PrimarySoft) { Text("TERKINI", color = Primary, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp)) }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Pendapatan kotor"); Text(dailySales?.let { Format.rupiah(it.gmvIdr) } ?: "Belum tersedia", fontWeight = FontWeight.Bold) }
            Text("${dailySales?.totalOrders ?: 0} pesanan selesai", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            FinanceLine("Komisi layanan", totals?.commissionMinor?.let { "-${Format.rupiah(it)}" } ?: "Belum tersedia", Accent)
            FinanceLine("Kontribusi promo merchant", totals?.promoSubsidyMinor?.let { "-${Format.rupiah(it)}" } ?: "Belum tersedia", Accent)
            FinanceLine("Pajak & biaya", totals?.let { Format.rupiah(it.taxMinor + it.feeMinor) } ?: "Belum tersedia", MaterialTheme.colorScheme.onSurfaceVariant)
            Surface(shape = RoundedCornerShape(12.dp), color = PrimarySoft) { Row(Modifier.fillMaxWidth().padding(11.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text("Saldo bersih", fontWeight = FontWeight.Bold); Text(totals?.let { Format.rupiah(it.netBalanceMinor) } ?: "Belum tersedia", color = Primary, fontWeight = FontWeight.Bold) } }
            if (statement?.entries.isNullOrEmpty()) Text("Belum ada transaksi keuangan untuk ditampilkan.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun FinanceLine(label: String, value: String, valueColor: Color) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(value, color = valueColor, fontWeight = FontWeight.SemiBold) }
}

@Composable
private fun TaxCard(tax: com.tembus.merchant.data.model.MerchantTaxSummary?) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.Security, contentDescription = null, tint = Primary, modifier = Modifier.size(19.dp)); Spacer(Modifier.size(7.dp)); Text("Pajak & tagihan", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
            FinanceLine("Penjualan kena pajak", tax?.let { Format.rupiah(it.taxableSalesIdr) } ?: "Belum tersedia", MaterialTheme.colorScheme.onSurface)
            FinanceLine("PPN", tax?.let { Format.rupiah(it.ppnIdr) } ?: "Belum tersedia", MaterialTheme.colorScheme.onSurface)
            FinanceLine("Dokumen tagihan wajib / terbit", tax?.let { "${it.invoiceRequired} / ${it.invoiceIssued}" } ?: "Belum tersedia", MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun WithdrawalHistoryCard(withdrawals: List<MerchantWithdrawalRecord>, settlements: List<SettlementRecord>, onRetry: () -> Unit) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.ReceiptLong, contentDescription = null, tint = Primary, modifier = Modifier.size(19.dp)); Spacer(Modifier.size(7.dp)); Text("Riwayat pencairan", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
                Text("${withdrawals.size + settlements.size} transaksi", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (withdrawals.isEmpty() && settlements.isEmpty()) {
                Text("Belum ada riwayat pencairan.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(onClick = onRetry, modifier = Modifier.fillMaxWidth()) { Text("Muat ulang") }
            } else {
                withdrawals.take(3).forEach { WithdrawalRow(it) }
                settlements.take(3).forEach { SettlementRow(it) }
            }
        }
    }
}

@Composable
private fun WithdrawalRow(record: MerchantWithdrawalRecord) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Surface(shape = CircleShape, color = AccentSoft, modifier = Modifier.size(34.dp)) { Icon(Icons.Filled.AccountBalance, contentDescription = null, tint = Accent, modifier = Modifier.padding(8.dp)) }
        Spacer(Modifier.size(9.dp))
        Column(Modifier.weight(1f)) { Text("Penarikan ${record.status.lowercase().replace('_', ' ')}", fontWeight = FontWeight.SemiBold); Text(record.createdAt.take(10), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Text(Format.rupiah(record.amountIdr), color = if (record.status.equals("completed", true)) Primary else Accent, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun SettlementRow(record: SettlementRecord) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Surface(shape = CircleShape, color = PrimarySoft, modifier = Modifier.size(34.dp)) { Icon(Icons.Filled.ArrowForward, contentDescription = null, tint = Primary, modifier = Modifier.padding(8.dp)) }
        Spacer(Modifier.size(9.dp))
        Column(Modifier.weight(1f)) { Text("Pencairan pesanan", fontWeight = FontWeight.SemiBold); Text(record.createdAt.take(10), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Text(Format.rupiah(record.netPayoutIdr), color = Primary, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun DiscrepancyCard(statement: MerchantFinanceStatement) {
    Card(colors = CardDefaults.cardColors(containerColor = AccentSoft), modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.ErrorOutline, contentDescription = null, tint = Accent)
            Spacer(Modifier.size(8.dp))
            Column { Text("Perlu diperiksa", color = Accent, fontWeight = FontWeight.Bold); Text("${statement.discrepancies.size} transaksi sedang diperiksa oleh tim keuangan.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun WithdrawalDialog(maxAmount: Long, bankName: String, accountNumber: String, holder: String, onDismiss: () -> Unit, onConfirm: (Long) -> Unit) {
    var amount by remember { mutableStateOf("") }
    val parsedAmount = amount.filter(Char::isDigit).toLongOrNull() ?: 0L
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Tarik dana") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("$bankName • ${maskAccount(accountNumber)} • $holder", style = MaterialTheme.typography.bodySmall)
                Text("Pencairan perlu konfirmasi keamanan untuk melindungi akun Anda.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(value = amount, onValueChange = { amount = it.filter(Char::isDigit).take(12) }, label = { Text("Nominal (maks. ${Format.rupiah(maxAmount)})") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true)
            }
        },
        confirmButton = { TextButton(onClick = { onConfirm(parsedAmount) }, enabled = parsedAmount in 10_000..maxAmount) { Text("Ajukan") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Batal") } }
    )
}

private fun maskAccount(account: String): String = if (account.length <= 4) account else "•••• ${account.takeLast(4)}"
