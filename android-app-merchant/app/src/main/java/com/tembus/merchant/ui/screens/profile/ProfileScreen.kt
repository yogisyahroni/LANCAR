package com.tembus.merchant.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.data.model.UpdateBankAccountRequest
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.screens.promo.PromoScreen
import com.tembus.merchant.ui.screens.home.OperatingHoursDialog
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.GreenText
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryLight

/**
 * ProfileScreen — tab Profil: info merchant, status verifikasi,
 * akses Promo & Diskon, dan logout. (FOOD-BIKE-049: status verifikasi di sini.)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onGoToRegistration: () -> Unit,
    onLoggedOut: () -> Unit,
    viewModel: ProfileViewModel = appViewModel {
        ProfileViewModel(it.merchantRepository, it.authRepository, it.sessionManager)
    }
) {
    val state by viewModel.uiState.collectAsState()
    var showPromo by remember { mutableStateOf(false) }
    var showMinOrderDialog by remember { mutableStateOf(false) } // FB-109
    var showOperatingHoursDialog by remember { mutableStateOf(false) } // M5

    if (showPromo) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Header promo dengan tombol kembali
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Primary)
                    .padding(horizontal = 4.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = { showPromo = false }) {
                    Icon(
                        androidx.compose.material.icons.Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Kembali",
                        tint = MaterialTheme.colorScheme.onPrimary
                    )
                }
                Text(
                    text = "Promo & Diskon",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimary
                )
            }
            PromoScreen()
        }
        return
    }

    state.errorMessage?.let { msg ->
        AlertDialog(
            onDismissRequest = viewModel::clearError,
            confirmButton = {
                TextButton(onClick = viewModel::clearError) { Text("OK") }
            },
            title = { Text("Perhatian") },
            text = { Text(msg) }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
        if (state.needsRegistration) {
            Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        imageVector = Icons.Filled.Storefront,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = Primary
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Belum terdaftar sebagai merchant",
                        style = MaterialTheme.typography.titleMedium,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(onClick = onGoToRegistration) {
                        Text("Daftar Sekarang")
                    }
                }
            }
        }

        state.merchant?.let { m ->
            // Kartu identitas toko
            Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            color = PrimaryLight,
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Storefront,
                                contentDescription = null,
                                tint = Primary,
                                modifier = Modifier.padding(12.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(16.dp))
                        Column {
                            Text(
                                text = m.namaToko,
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = m.alamat,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    VerificationStatusCard(status = m.verificationStatus)

                    Spacer(modifier = Modifier.height(16.dp))

                    // Info tambahan
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        ProfileInfoRow(
                            "Jam Operasional",
                            if (m.jamBuka != null && m.jamTutup != null) "${m.jamBuka} - ${m.jamTutup}" else "Belum diatur"
                        )
                        Spacer(modifier = Modifier.weight(1f))
                        TextButton(onClick = { showOperatingHoursDialog = true }) {
                            Text("Atur", color = Primary)
                        }
                    }
                    ProfileInfoRow("Status Toko", if (m.isOpen) "Buka" else "Tutup")
                    ProfileInfoRow("Completion Rate", "${m.completionRatePct}%")
                    m.createdAt?.let { ProfileInfoRow("Terdaftar", it.substring(0, 10)) }

                    // FB-109: minimal order value — merchant bisa atur dari app.
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        ProfileInfoRow(
                            "Minimal Order",
                            if (m.minOrderIdr > 0) "Rp ${Format.rupiah(m.minOrderIdr)}" else "Tidak ada"
                        )
                        Spacer(modifier = Modifier.weight(1f))
                        TextButton(onClick = { showMinOrderDialog = true }) {
                            Text("Atur", color = Primary)
                        }
                    }
                    state.minOrderSaveError?.let {
                        Text(
                            text = it,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // FB-114: rekening bank untuk payout — lihat & ubah dari app.
            BankAccountSection(
                bankName = m.bankName,
                bankAccountNumber = m.bankAccountNumber,
                bankAccountHolder = m.bankAccountHolder,
                bankAccountVerified = m.bankAccountVerified,
                isSaving = state.isSavingBank,
                saveError = state.bankSaveError,
                saved = state.bankSaved,
                onSavedDismiss = viewModel::clearBankSaved,
                onSave = viewModel::updateBankAccount
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Promo & Diskon (pindah dari tab, akses via Profil)
        Card(
            onClick = { showPromo = true },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp)
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.tertiaryContainer,
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(
                        androidx.compose.material.icons.Icons.Filled.LocalOffer,
                        contentDescription = null,
                        tint = Accent,
                        modifier = Modifier.padding(10.dp)
                    )
                }
                Spacer(modifier = Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Promo & Diskon",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = "Kelola promo menu-mu",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Icon(
                    androidx.compose.material.icons.Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Status Pesanan (legend sesuai spec design)
        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Status Pesanan",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                val legend = listOf(
                    "Baru" to Accent,
                    "Diproses" to Primary,
                    "Siap" to Primary,
                    "Diambil Driver" to Primary,
                    "Diantar" to Primary,
                    "Selesai" to Primary,
                    "Ditolak / Dibatalkan" to MaterialTheme.colorScheme.error
                )
                legend.forEach { (label, color) ->
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 2.dp)) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(RoundedCornerShape(5.dp))
                                .background(color)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(label, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Metode Pembayaran (info statis — OVO, GoPay, ShopeePay)
        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Metode Pembayaran",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Pembayaran terintegrasi: OVO, GoPay, ShopeePay.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Akun
        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
            Column(modifier = Modifier.padding(8.dp)) {
                state.name?.let {
                    ProfileActionRow(title = it, subtitle = state.email)
                }
                HorizontalDivider()
                TextButton(
                    onClick = viewModel::logout,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        Icons.Filled.Logout,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = MaterialTheme.colorScheme.error
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Keluar", color = MaterialTheme.colorScheme.error)
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "TEMBUS Merchant v1.0",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth()
        )
        }
    }

    // FB-109: dialog atur minimal order value.
    if (showMinOrderDialog) {
        var minOrderText by remember { mutableStateOf(state.merchant?.minOrderIdr?.toString() ?: "0") }
        ModalBottomSheet(onDismissRequest = { showMinOrderDialog = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 36.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text(
                    text = "Minimal Order",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Order dengan subtotal di bawah nominal ini akan ditolak otomatis. 0 = tidak ada minimum.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedTextField(
                    value = minOrderText,
                    onValueChange = { minOrderText = it.filter { c -> c.isDigit() }.take(9) },
                    label = { Text("Minimal order") },
                    prefix = { Text("Rp ") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                if (state.isSavingMinOrder) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                }
                Button(
                    onClick = {
                        val value = minOrderText.toLongOrNull() ?: 0L
                        viewModel.updateMinOrder(value)
                        showMinOrderDialog = false
                    },
                    enabled = !state.isSavingMinOrder,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                ) {
                    Text("Simpan", style = MaterialTheme.typography.titleMedium)
                }
                TextButton(
                    onClick = { showMinOrderDialog = false },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Batal")
                }
            }
        }
    }

    // M5: dialog atur jam operasional (buka/tutup)
    if (showOperatingHoursDialog) {
        OperatingHoursDialog(
            currentBuka = state.merchant?.jamBuka,
            currentTutup = state.merchant?.jamTutup,
            onDismiss = { showOperatingHoursDialog = false },
            onSave = { buka, tutup ->
                viewModel.updateOperatingHours(buka, tutup)
                showOperatingHoursDialog = false
            }
        )
    }
}

@Composable
private fun VerificationStatusCard(status: String) {
    data class Style(
        val label: String,
        val container: Color,
        val content: Color,
        val icon: ImageVector
    )

    val style = when (status) {
        "approved" -> Style(
            label = "Terverifikasi",
            container = MaterialTheme.colorScheme.primaryContainer,
            content = MaterialTheme.colorScheme.onPrimaryContainer,
            icon = Icons.Filled.Info
        )
        "pending" -> Style(
            label = "Menunggu Verifikasi Admin",
            container = MaterialTheme.colorScheme.tertiaryContainer,
            content = MaterialTheme.colorScheme.onTertiaryContainer,
            icon = Icons.Filled.Info
        )
        "rejected" -> Style(
            label = "Verifikasi Ditolak",
            container = MaterialTheme.colorScheme.errorContainer,
            content = MaterialTheme.colorScheme.onErrorContainer,
            icon = Icons.Filled.Info
        )
        else -> Style(
            label = "Status: $status",
            container = MaterialTheme.colorScheme.surfaceVariant,
            content = MaterialTheme.colorScheme.onSurfaceVariant,
            icon = Icons.Filled.Info
        )
    }
    Surface(
        color = style.container,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                style.icon,
                contentDescription = null,
                tint = style.content,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = style.label,
                style = MaterialTheme.typography.labelLarge,
                color = style.content,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}

@Composable
private fun ProfileInfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun ProfileActionRow(title: String, subtitle: String?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(title, style = MaterialTheme.typography.titleMedium)
            subtitle?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/**
 * FB-114: kartu rekening bank — tampilkan data saat ini + tombol ubah
 * yang membuka form (nama bank, nomor rekening, pemilik).
 */
@Composable
private fun BankAccountSection(
    bankName: String?,
    bankAccountNumber: String?,
    bankAccountHolder: String?,
    bankAccountVerified: Boolean,
    isSaving: Boolean,
    saveError: String?,
    saved: Boolean,
    onSavedDismiss: () -> Unit,
    onSave: (UpdateBankAccountRequest) -> Unit
) {
    var editing by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf(bankName ?: "") }
    var number by remember { mutableStateOf(bankAccountNumber ?: "") }
    var holder by remember { mutableStateOf(bankAccountHolder ?: "") }

    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Filled.AccountBalance,
                        contentDescription = null,
                        tint = Primary,
                        modifier = Modifier.padding(10.dp)
                    )
                }
                Spacer(modifier = Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Rekening Bank",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = if (bankAccountVerified) "Terverifikasi — untuk pencairan pendapatan"
                        else "Perlu verifikasi ulang admin",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (bankAccountVerified) GreenText else MaterialTheme.colorScheme.error
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (editing) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Nama Bank") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = number,
                    onValueChange = { number = it.filter { c -> c.isDigit() }.take(30) },
                    label = { Text("Nomor Rekening") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = holder,
                    onValueChange = { holder = it },
                    label = { Text("Nama Pemilik Rekening") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(12.dp))
                saveError?.let {
                    Text(
                        text = it,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }
                Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                    TextButton(onClick = { editing = false }) { Text("Batal") }
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(
                        onClick = {
                            onSave(
                                UpdateBankAccountRequest(
                                    bankName = name.trim(),
                                    bankAccountNumber = number.trim(),
                                    bankAccountHolder = holder.trim()
                                )
                            )
                            editing = false
                        },
                        enabled = name.isNotBlank() && number.length >= 5 && holder.isNotBlank() && !isSaving
                    ) {
                        if (isSaving) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        } else {
                            Text("Simpan")
                        }
                    }
                }
            } else {
                if (bankName.isNullOrBlank()) {
                    Text(
                        text = "Belum mengisi rekening bank. Lengkapi untuk menerima pencairan pendapatan.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    ProfileInfoRow("Bank", bankName)
                    ProfileInfoRow("Nomor", bankAccountNumber.orEmpty())
                    ProfileInfoRow("Pemilik", bankAccountHolder.orEmpty())
                }
                Spacer(modifier = Modifier.height(8.dp))
                TextButton(onClick = {
                    name = bankName ?: ""
                    number = bankAccountNumber ?: ""
                    holder = bankAccountHolder ?: ""
                    editing = true
                }) { Text("Ubah Rekening") }
            }
        }
    }

    // Toast-like: sukses simpan
    if (saved) {
        LaunchedEffect(saved) {
            onSavedDismiss()
        }
        AlertDialog(
            onDismissRequest = onSavedDismiss,
            confirmButton = {
                TextButton(onClick = onSavedDismiss) { Text("OK") }
            },
            title = { Text("Rekening Disimpan") },
            text = {
                Text("Rekening bank berhasil diperbarui. Rekening baru perlu verifikasi admin sebelum digunakan untuk pencairan.")
            }
        )
    }
}
