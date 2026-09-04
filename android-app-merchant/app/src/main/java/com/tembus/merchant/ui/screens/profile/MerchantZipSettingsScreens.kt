package com.tembus.merchant.ui.screens.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Store
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import com.tembus.merchant.ui.localization.MerchantText as Text
import com.tembus.merchant.ui.localization.MerchantTextCatalog
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.RadioButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.data.model.UpdateBankAccountRequest
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale

/**
 * Native ZIP port for Store Information. This route is intentionally read-only
 * until the backend exposes an update contract for the public store fields.
 */
@Composable
fun StoreInformationZipScreen(
    onBack: () -> Unit,
    onEditPublicProfile: () -> Unit,
    viewModel: ProfileViewModel = appViewModel {
        ProfileViewModel(it.merchantRepository, it.authRepository, it.sessionManager)
    }
) {
    val state by viewModel.uiState.collectAsState()

    ZipSettingsScaffold(
        title = "Store Information",
        onBack = onBack,
        isRefreshing = state.isLoading && state.merchant != null,
        onRefresh = viewModel::load,
        bottomBar = {
            Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 8.dp) {
                Button(
                    onClick = onEditPublicProfile,
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Accent)
                ) { Text("UPDATE INFORMATION") }
            }
        }
    ) {
        when {
            state.isLoading -> ZipSettingsLoading()
            state.merchant == null -> ZipSettingsEmptyState(
                message = state.errorMessage ?: "Informasi toko belum tersedia dari backend.",
                onRetry = viewModel::load
            )
            else -> StoreInformationZipContent(state.merchant!!)
        }
    }
}

@Composable
private fun StoreInformationZipContent(merchant: Merchant) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        ZipSettingsCard {
            Text("Location Details", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            ZipReadOnlyField("Store Address", merchant.alamat)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.LocationOn, contentDescription = "", tint = Primary)
                Spacer(Modifier.size(8.dp))
                val coordinates = if (merchant.lokasiLat != null && merchant.lokasiLng != null) {
                    "${merchant.lokasiLat}, ${merchant.lokasiLng}"
                } else {
                    "Location coordinates not configured"
                }
                Text(coordinates, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        ZipSettingsCard {
            Text("Contact Information", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            ZipReadOnlyField("Contact Number", merchant.ownerPhone)
            ZipReadOnlyField("Store Email", merchant.ownerEmail)
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Icon(Icons.Filled.Phone, contentDescription = "", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Icon(Icons.Filled.Email, contentDescription = "", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        ZipSettingsCard {
            Text("Business Details", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            ZipReadOnlyField("Business Name", merchant.namaToko)
            ZipReadOnlyField("Verification Status", merchant.verificationStatus)
        }
    }
}

/** Native ZIP port for Payment Settings backed by the real bank-account API. */
@Composable
fun PaymentSettingsZipScreen(
    onBack: () -> Unit,
    onOpenSettlement: (() -> Unit)? = null,
    viewModel: ProfileViewModel = appViewModel {
        ProfileViewModel(it.merchantRepository, it.authRepository, it.sessionManager)
    }
) {
    val state by viewModel.uiState.collectAsState()
    var editing by remember { mutableStateOf(false) }
    var bankName by remember { mutableStateOf("") }
    var accountNumber by remember { mutableStateOf("") }
    var accountHolder by remember { mutableStateOf("") }
    var payoutSchedule by remember { mutableStateOf("daily") }
    var npwp by remember { mutableStateOf("") }

    LaunchedEffect(state.merchant?.id) {
        state.merchant?.let {
            bankName = it.bankName.orEmpty()
            accountNumber = it.bankAccountNumber.orEmpty()
            accountHolder = it.bankAccountHolder.orEmpty()
            payoutSchedule = it.payoutSchedule.ifBlank { "daily" }
            npwp = it.npwp.orEmpty()
        }
    }
    LaunchedEffect(state.bankSaved) {
        if (state.bankSaved) {
            editing = false
            viewModel.clearBankSaved()
        }
    }

    ZipSettingsScaffold(
        title = "Payment Settings",
        onBack = onBack,
        isRefreshing = state.isLoading && state.merchant != null,
        onRefresh = viewModel::load,
        bottomBar = {
            Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 8.dp) {
                Button(
                    onClick = { viewModel.updatePaymentSettings(payoutSchedule, npwp.trim()) },
                    enabled = !state.isSavingPayment && state.errorMessage == null,
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Primary)
                ) {
                    if (state.isSavingPayment) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    else {
                        Icon(Icons.Filled.Save, contentDescription = "", modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(8.dp))
                        Text("SAVE SETTINGS")
                    }
                }
            }
        }
    ) {
        when {
            state.isLoading -> ZipSettingsLoading()
            state.merchant == null -> ZipSettingsEmptyState(
                message = state.errorMessage ?: "Pengaturan pembayaran belum tersedia dari backend.",
                onRetry = viewModel::load
            )
            else -> {
                val merchant = state.merchant!!
                Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
                    Text(
                        "Manage your payout account and settlement information.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    ZipInfoBanner(
                        title = "Secure Payment Setup",
                        body = "Informasi keuangan dibaca dari akun merchant dan dikirim melalui koneksi API yang terlindungi."
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Linked Bank Account", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            if (!editing) {
                                TextButton(onClick = { editing = true }) { Text("CHANGE BANK") }
                            }
                        }
                        if (editing) {
                            BankAccountEditor(
                                bankName = bankName,
                                accountNumber = accountNumber,
                                accountHolder = accountHolder,
                                isSaving = state.isSavingBank,
                                error = state.bankSaveError,
                                onBankNameChange = { bankName = it },
                                onAccountNumberChange = { accountNumber = it.filter(Char::isDigit).take(30) },
                                onAccountHolderChange = { accountHolder = it },
                                onCancel = { editing = false },
                                onSave = {
                                    viewModel.updateBankAccount(
                                        UpdateBankAccountRequest(
                                            bankName = bankName.trim(),
                                            bankAccountNumber = accountNumber.trim(),
                                            bankAccountHolder = accountHolder.trim()
                                        )
                                    )
                                }
                            )
                        } else {
                            LinkedBankCard(merchant)
                        }
                    }
                    PayoutScheduleSection(payoutSchedule) { payoutSchedule = it }
                    onOpenSettlement?.let {
                        TextButton(onClick = it, modifier = Modifier.align(Alignment.Start)) {
                            Text("VIEW PAYOUT HISTORY")
                        }
                    }
                    ZipSettingsCard {
                        Text("Tax Information", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        OutlinedTextField(
                            value = npwp,
                            onValueChange = { npwp = it.take(32) },
                            label = { Text("NPWP (Taxpayer Identification Number)") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.fillMaxWidth()
                        )
                        Text(
                            "Required for accurate tax reporting on payouts.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    state.paymentSaveError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    if (state.paymentSaved) {
                        Text("Payment settings saved.", color = Color(0xFF16A34A))
                    }
                }
            }
        }
    }
}

@Composable
private fun PayoutScheduleSection(selected: String, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Payout Schedule", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(
            "Choose how often you want funds transferred to your bank account.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        listOf(
            Triple("daily", "Daily", "Funds transferred every business day."),
            Triple("weekly", "Weekly", "Funds transferred every Monday."),
            Triple("monthly", "Monthly", "Funds transferred on the first of every month.")
        ).forEach { (value, label, description) ->
            Card(
                onClick = { onSelect(value) },
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, if (selected == value) Primary else MaterialTheme.colorScheme.outlineVariant),
                shape = RoundedCornerShape(8.dp)
            ) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(label, fontWeight = FontWeight.SemiBold)
                        Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    RadioButton(selected = selected == value, onClick = { onSelect(value) })
                }
            }
        }
    }
}

@Composable
private fun BankAccountEditor(
    bankName: String,
    accountNumber: String,
    accountHolder: String,
    isSaving: Boolean,
    error: String?,
    onBankNameChange: (String) -> Unit,
    onAccountNumberChange: (String) -> Unit,
    onAccountHolderChange: (String) -> Unit,
    onCancel: () -> Unit,
    onSave: () -> Unit
) {
    ZipSettingsCard {
        OutlinedTextField(
            value = bankName,
            onValueChange = onBankNameChange,
            label = { Text("Bank Name") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = accountNumber,
            onValueChange = onAccountNumberChange,
            label = { Text("Account Number") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = accountHolder,
            onValueChange = onAccountHolderChange,
            label = { Text("Account Holder") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = onCancel, enabled = !isSaving) { Text("Cancel") }
            Button(
                onClick = onSave,
                enabled = bankName.isNotBlank() && accountNumber.length >= 5 && accountHolder.isNotBlank() && !isSaving,
                colors = ButtonDefaults.buttonColors(containerColor = Primary)
            ) {
                if (isSaving) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                else {
                    Icon(Icons.Filled.Save, contentDescription = "", modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(8.dp))
                    Text("SAVE SETTINGS")
                }
            }
        }
    }
}

@Composable
private fun LinkedBankCard(merchant: Merchant) {
    ZipSettingsCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier.size(64.dp)
            ) {
                Icon(Icons.Filled.AccountBalance, contentDescription = "", modifier = Modifier.padding(16.dp))
            }
            Spacer(Modifier.size(24.dp))
            Column {
                Text(
                    merchant.bankName?.takeIf { it.isNotBlank() } ?: "Belum ada rekening tertaut",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.size(4.dp))
                Text(
                    merchant.bankAccountNumber?.let(::maskAccountNumber) ?: "Nomor rekening belum tersedia",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 2.sp
                )
                Spacer(Modifier.size(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(if (merchant.bankAccountVerified) Color(0xFF16A34A) else MaterialTheme.colorScheme.error))
                    Spacer(Modifier.size(4.dp))
                    Text(
                        if (merchant.bankAccountVerified) "Verified & Active" else "Menunggu verifikasi admin",
                        style = MaterialTheme.typography.labelMedium,
                        color = if (merchant.bankAccountVerified) Color(0xFF16A34A) else MaterialTheme.colorScheme.error
                    )
                }
            }
        }
    }
}

private fun maskAccountNumber(number: String): String {
    if (number.length <= 4) return number
    return "•••• •••• ${number.takeLast(4)}"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ZipSettingsScaffold(
    title: String,
    onBack: () -> Unit,
    isRefreshing: Boolean = false,
    onRefresh: (() -> Unit)? = null,
    bottomBar: @Composable (() -> Unit)? = null,
    content: @Composable () -> Unit
) {
    Scaffold(
        containerColor = PrimaryPale,
        bottomBar = { bottomBar?.invoke() },
        topBar = {
            TopAppBar(
                title = { Text(title, fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = MerchantTextCatalog.translate("Go back"))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = PrimaryPale)
            )
        }
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = { onRefresh?.invoke() },
            modifier = Modifier.fillMaxSize()
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                item { Spacer(Modifier.height(8.dp)) }
                item { content() }
                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}

@Composable
private fun ZipSettingsCard(content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

@Composable
private fun ZipInfoBanner(title: String, body: String) {
    ZipSettingsCard {
        Row(verticalAlignment = Alignment.Top) {
            Icon(Icons.Filled.Lock, contentDescription = "", tint = Primary, modifier = Modifier.padding(top = 4.dp))
            Spacer(Modifier.size(16.dp))
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun ZipUnavailableSection(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, body: String) {
    ZipSettingsCard {
        Row(verticalAlignment = Alignment.Top) {
            Icon(icon, contentDescription = "", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.size(12.dp))
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun ZipReadOnlyField(label: String, value: String) {
    OutlinedTextField(
        value = value.ifBlank { "Belum tersedia" },
        onValueChange = {},
        readOnly = true,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp)
    )
}

@Composable
private fun ZipUnavailableNote(body: String) {
    Text(body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun ZipSettingsLoading() {
    Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Primary)
    }
}

@Composable
private fun ZipSettingsEmptyState(message: String, onRetry: (() -> Unit)? = null) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(Icons.Filled.Store, contentDescription = "", tint = Primary, modifier = Modifier.size(40.dp))
        Spacer(Modifier.height(8.dp))
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
        onRetry?.let {
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = it) { Text("Coba Lagi") }
        }
    }
}
