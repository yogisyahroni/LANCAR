package com.tembus.customer.ui.screens.profile

import android.app.Activity
import android.view.WindowManager
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.data.model.WithdrawLimits
import com.tembus.customer.ui.theme.Primary

/**
 * WithdrawDialog — Dialog Tarik Dana untuk Customer
 *
 * FITUR KEAMANAN YANG DIIMPLEMENTASIKAN:
 *
 * 1. FLAG_SECURE (WindowManager): Layar tidak bisa di-screenshot atau di-screen-record
 *    selama dialog terbuka. Mencegah kebocoran data: nomor rekening & saldo.
 *    Diaktifkan via Window Activity (LocalContext → Activity). DisposableEffect
 *    memastikan flag SELALU dihapus saat dialog ditutup.
 *
 * 2. Keyboard Numerik (KeyboardType.NumberPassword): Field amount & account number
 *    menggunakan keyboard angka — tidak ada tombol simbol/huruf yang tampil.
 *
 * 3. Input Filtering Real-Time:
 *    - Amount: hanya digit, no leading zero, max 11 digit
 *    - AccountNumber: hanya digit 0-9, max 18 karakter (termasuk skenario paste)
 *    - AccountHolder: whitelist — huruf, spasi, titik, apostrof
 *    - BankCode: dipilih dari chip whitelist (bukan free-text input)
 *
 * 4. Idempotency: UUID v4 baru dibangkitkan tiap dialog dibuka (via ViewModel).
 *
 * 5. 2-Step Confirmation: User melihat ringkasan sebelum menekan "Konfirmasi".
 *    Mencegah tap tidak sengaja, memberikan kesempatan koreksi.
 *
 * 6. Client-side Saldo Check: Tombol "Lanjut" disabled jika amount > saldo.
 *
 * @param walletBalance Saldo aktif untuk validasi "saldo cukup" di client
 * @param onDismiss Dipanggil saat dialog ditutup tanpa aksi
 * @param onSuccess Dipanggil setelah withdrawal berhasil — untuk refresh saldo
 */
@Composable
fun WithdrawDialog(
    walletBalance: Long,
    onDismiss: () -> Unit,
    onSuccess: () -> Unit,
    viewModel: WithdrawViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    // ─── SECURITY: FLAG_SECURE ────────────────────────────────────────────────
    // LocalActivity belum tersedia di Compose BOM 2024.09 (Compose 1.7.x).
    // Gunakan LocalContext + cast ke Activity — cara yang kompatibel dengan semua versi.
    val context = LocalContext.current
    DisposableEffect(Unit) {
        val activity = context as? Activity
        // Aktifkan FLAG_SECURE: layar menjadi hitam saat screenshot/screen record
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        onDispose {
            // WAJIB dihapus saat dialog ditutup agar layar lain tidak terpengaruh
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    // ─── FORM STATE ───────────────────────────────────────────────────────────
    var amountText    by remember { mutableStateOf("") }
    var accountNumber by remember { mutableStateOf("") }
    var accountHolder by remember { mutableStateOf("") }
    var selectedBank  by remember { mutableStateOf("") }
    var showConfirm   by remember { mutableStateOf(false) }

    val focusManager  = LocalFocusManager.current
    val amountFocus   = remember { FocusRequester() }

    val parsedAmount        = amountText.trim().toLongOrNull() ?: 0L
    val isBalanceSufficient = parsedAmount in 1L..walletBalance
    val isFormValid         = parsedAmount >= WithdrawLimits.MIN_AMOUNT &&
        parsedAmount <= WithdrawLimits.MAX_AMOUNT &&
        isBalanceSufficient &&
        WithdrawLimits.isValidAccountNumber(accountNumber.trim()) &&
        WithdrawLimits.isValidAccountHolder(accountHolder.trim()) &&
        WithdrawLimits.isValidBankCode(selectedBank.trim())

    // Otomatis tutup dialog dan refresh saldo setelah sukses
    LaunchedEffect(uiState) {
        if (uiState is WithdrawUiState.Success) {
            onSuccess()
            viewModel.reset()
        }
    }

    // ─── DIALOG ───────────────────────────────────────────────────────────────
    AlertDialog(
        onDismissRequest = {
            if (uiState !is WithdrawUiState.Loading) {
                viewModel.reset()
                onDismiss()
            }
        },
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(24.dp),
        // ── TITLE ─────────────────────────────────────────────────────────────
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Primary.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.AccountBalance,
                        contentDescription = "",
                        tint = Primary,
                        modifier = Modifier.size(20.dp)
                    )
                }
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(
                        "Tarik Dana",
                        fontWeight = FontWeight.Black,
                        fontSize = 20.sp,
                        letterSpacing = (-0.5).sp
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.Lock,
                            contentDescription = CustomerTextCatalog.translate("Layar Aman"),
                            tint = Color(0xFF4CAF50),
                            modifier = Modifier.size(12.dp)
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            "Layar dilindungi · Tidak bisa di-screenshot",
                            color = Color(0xFF4CAF50),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        },
        // ── BODY ──────────────────────────────────────────────────────────────
        text = {
            when (val state = uiState) {
                // Loading — tidak ada form, cegah interaksi
                is WithdrawUiState.Loading -> LoadingBody()

                // Sukses — ikon centang
                is WithdrawUiState.Success -> SuccessBody(state)

                // Form / Konfirmasi / Error
                else -> FormBody(
                    walletBalance     = walletBalance,
                    amountText        = amountText,
                    onAmountChange    = { amountText = it },
                    parsedAmount      = parsedAmount,
                    isBalanceSufficient = isBalanceSufficient,
                    accountNumber     = accountNumber,
                    onAccountNumChange = { accountNumber = it },
                    accountHolder     = accountHolder,
                    onAccountHolderChange = { accountHolder = it },
                    selectedBank      = selectedBank,
                    onBankSelect      = { selectedBank = it },
                    showConfirm       = showConfirm,
                    amountFocus       = amountFocus,
                    errorState        = state as? WithdrawUiState.Error,
                    validationState   = state as? WithdrawUiState.ValidationError
                )
            }
        },
        // ── BUTTONS ───────────────────────────────────────────────────────────
        confirmButton = {
            when (uiState) {
                is WithdrawUiState.Loading -> { /* Tidak ada tombol saat loading */ }
                is WithdrawUiState.Success -> {
                    Button(
                        onClick = { viewModel.reset(); onSuccess() },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4CAF50))
                    ) { Text("Selesai", fontWeight = FontWeight.Bold) }
                }
                else -> {
                    if (!showConfirm) {
                        Button(
                            onClick = {
                                focusManager.clearFocus()
                                showConfirm = true
                            },
                            enabled = isFormValid,
                            colors = ButtonDefaults.buttonColors(containerColor = Primary)
                        ) { Text("Lanjut →", fontWeight = FontWeight.Bold) }
                    } else {
                        Button(
                            onClick = {
                                viewModel.submitWithdraw(
                                    amountText    = amountText,
                                    accountNumber = accountNumber,
                                    accountHolder = accountHolder,
                                    bankCode      = selectedBank
                                )
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE53935))
                        ) { Text("Konfirmasi Tarik Dana", fontWeight = FontWeight.Bold) }
                    }
                }
            }
        },
        dismissButton = {
            when (uiState) {
                is WithdrawUiState.Loading, is WithdrawUiState.Success -> { /* Tidak ada */ }
                else -> {
                    if (showConfirm) {
                        TextButton(onClick = { showConfirm = false }) { Text("← Ubah Data") }
                    } else {
                        TextButton(onClick = { viewModel.reset(); onDismiss() }) { Text("Batal") }
                    }
                }
            }
        }
    )
}

// ─── Sub-Composables ──────────────────────────────────────────────────────────

@Composable
private fun LoadingBody() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        CircularProgressIndicator(color = Primary)
        Text("Memproses permintaan...", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
        Text("Jangan tutup aplikasi", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f), fontSize = 12.sp)
    }
}

@Composable
private fun SuccessBody(state: WithdrawUiState.Success) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(Icons.Default.CheckCircle, contentDescription = "", tint = Color(0xFF4CAF50), modifier = Modifier.size(64.dp))
        Text("Permintaan Diterima!", fontWeight = FontWeight.Black, fontSize = 18.sp)
        Text(
            state.response.message.ifBlank { "Dana sedang diproses ke rekening Anda." },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 13.sp
        )
    }
}

@Composable
private fun FormBody(
    walletBalance: Long,
    amountText: String,
    onAmountChange: (String) -> Unit,
    parsedAmount: Long,
    isBalanceSufficient: Boolean,
    accountNumber: String,
    onAccountNumChange: (String) -> Unit,
    accountHolder: String,
    onAccountHolderChange: (String) -> Unit,
    selectedBank: String,
    onBankSelect: (String) -> Unit,
    showConfirm: Boolean,
    amountFocus: FocusRequester,
    errorState: WithdrawUiState.Error?,
    validationState: WithdrawUiState.ValidationError?
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {

        // Saldo tersedia
        BalanceRow(walletBalance)

        HorizontalDivider(thickness = 0.5.dp, color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))

        // Form input (tersembunyi saat showConfirm)
        AnimatedVisibility(
            visible = !showConfirm,
            enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically()
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {

                // ── AMOUNT ────────────────────────────────────────────────
                OutlinedTextField(
                    value = amountText,
                    onValueChange = { raw ->
                        // Filter real-time: hanya digit, no leading zero, max 11 digit
                        val filtered = raw.filter { it.isDigit() }.trimStart('0').take(11)
                        onAmountChange(filtered)
                    },
                    label = { Text("Jumlah Penarikan (Rp)") },
                    placeholder = { Text("Contoh: 100000") },
                    leadingIcon = { Icon(Icons.Default.AttachMoney, contentDescription = "") },
                    suffix = {
                        if (parsedAmount > 0L) {
                            Text(
                                WithdrawLimits.formatRupiah(parsedAmount),
                                color = if (isBalanceSufficient) Primary else MaterialTheme.colorScheme.error,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().focusRequester(amountFocus),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.NumberPassword, // Angka murni, no desimal/simbol
                        imeAction = ImeAction.Next
                    ),
                    isError = amountText.isNotEmpty() && (
                        parsedAmount < WithdrawLimits.MIN_AMOUNT ||
                        parsedAmount > WithdrawLimits.MAX_AMOUNT ||
                        !isBalanceSufficient
                    ),
                    supportingText = {
                        when {
                            amountText.isNotEmpty() && parsedAmount > walletBalance ->
                                Text("Saldo tidak mencukupi", color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                            amountText.isNotEmpty() && parsedAmount < WithdrawLimits.MIN_AMOUNT ->
                                Text("Minimum Rp 10.000", color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                            amountText.isNotEmpty() && parsedAmount > WithdrawLimits.MAX_AMOUNT ->
                                Text("Maksimum Rp 50.000.000 per transaksi", color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                            else ->
                                Text("Min Rp 10.000 · Maks Rp 50.000.000", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                        }
                    },
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Primary, focusedLabelColor = Primary)
                )

                // ── NOMOR REKENING ────────────────────────────────────────
                OutlinedTextField(
                    value = accountNumber,
                    onValueChange = { raw ->
                        // Filter: hanya digit 0-9, max 18 karakter
                        // Penting untuk skenario PASTE dari clipboard yang mungkin
                        // mengandung spasi/tanda hubung (misal: "1234 5678 90")
                        onAccountNumChange(raw.filter { it.isDigit() }.take(18))
                    },
                    label = { Text("Nomor Rekening Tujuan") },
                    placeholder = { Text("10–18 digit angka") },
                    leadingIcon = { Icon(Icons.Default.AccountBalance, contentDescription = "") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Next),
                    isError = accountNumber.isNotEmpty() && !WithdrawLimits.isValidAccountNumber(accountNumber.trim()),
                    supportingText = {
                        if (accountNumber.isNotEmpty() && !WithdrawLimits.isValidAccountNumber(accountNumber.trim())) {
                            Text("Harus 10–18 digit angka saja", color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                        } else {
                            Text("Hanya angka (standar BI-FAST / SKNBI)", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                        }
                    },
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Primary, focusedLabelColor = Primary)
                )

                // ── NAMA PEMILIK REKENING ─────────────────────────────────
                OutlinedTextField(
                    value = accountHolder,
                    onValueChange = { raw ->
                        // Whitelist filter: huruf, spasi, titik, apostrof — max 100 char
                        // Tolak: angka, simbol, tanda kurung, HTML tag, dll.
                        onAccountHolderChange(raw.filter { c -> c.isLetter() || c == ' ' || c == '.' || c == '\'' }.take(100))
                    },
                    label = { Text("Nama Pemilik Rekening") },
                    placeholder = { Text("Sesuai nama di buku tabungan") },
                    leadingIcon = { Icon(Icons.Default.Person, contentDescription = "") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Next),
                    isError = accountHolder.isNotEmpty() && !WithdrawLimits.isValidAccountHolder(accountHolder.trim()),
                    supportingText = {
                        Text("Huruf dan spasi saja — sesuai nama di bank", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                    },
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Primary, focusedLabelColor = Primary)
                )

                // ── BANK SELECTOR ─────────────────────────────────────────
                BankSelector(selectedCode = selectedBank, onSelect = onBankSelect)
            }
        }

        // Ringkasan konfirmasi (tampil saat showConfirm = true)
        AnimatedVisibility(
            visible = showConfirm,
            enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically()
        ) {
            ConfirmationSummary(
                amount        = parsedAmount,
                accountNumber = accountNumber,
                accountHolder = accountHolder,
                bankCode      = selectedBank
            )
        }

        // Error & Validation messages
        val errorMessage = errorState?.message ?: validationState?.message
        if (!errorMessage.isNullOrBlank()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.85f))
                    .padding(12.dp),
                verticalAlignment = Alignment.Top
            ) {
                Icon(Icons.Default.Warning, contentDescription = "", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(errorMessage, color = MaterialTheme.colorScheme.onErrorContainer, fontSize = 13.sp)
            }
        }
    }
}

// ─── Helper Composables ───────────────────────────────────────────────────────

@Composable
private fun BalanceRow(balance: Long) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("Saldo tersedia", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
        Text(
            WithdrawLimits.formatRupiah(balance),
            fontWeight = FontWeight.Bold,
            color = Primary,
            fontSize = 15.sp
        )
    }
}

@Composable
private fun ConfirmationSummary(amount: Long, accountNumber: String, accountHolder: String, bankCode: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f), RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("Ringkasan Penarikan", fontWeight = FontWeight.Bold, fontSize = 15.sp)
        HorizontalDivider(thickness = 0.5.dp, color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
        ConfirmRow("Jumlah", WithdrawLimits.formatRupiah(amount), isHighlight = true)
        ConfirmRow("Bank / E-Wallet", bankCode.uppercase())
        ConfirmRow("Nomor Rekening", accountNumber)
        ConfirmRow("Pemilik Rekening", accountHolder)
        HorizontalDivider(thickness = 0.5.dp, color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
        Text(
            "⚠\uFE0F Pastikan data sudah benar. Penarikan yang sudah diproses tidak dapat dibatalkan.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 11.sp
        )
    }
}

@Composable
private fun ConfirmRow(label: String, value: String, isHighlight: Boolean = false) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, modifier = Modifier.weight(1f))
        Text(
            value,
            fontWeight = if (isHighlight) FontWeight.Black else FontWeight.SemiBold,
            color = if (isHighlight) Primary else MaterialTheme.colorScheme.onSurface,
            fontSize = if (isHighlight) 16.sp else 13.sp
        )
    }
}

// ─── Bank Selector ────────────────────────────────────────────────────────────

/** Daftar bank & e-wallet yang didukung. Dipilih dari chip — bukan free-text. */
private val SUPPORTED_BANKS = listOf(
    "BCA", "BNI", "BRI", "MANDIRI", "BSI", "CIMB", "PERMATA",
    "DANAMON", "MEGA", "BTN", "MAYBANK", "OCBC", "PANIN",
    "GOPAY", "OVO", "DANA", "SHOPEEPAY", "LINKAJA"
)

/**
 * BankSelector — Pilihan bank menggunakan chip grid, BUKAN free-text.
 *
 * Alasan whitelist chip vs input bebas:
 * - Mencegah user menginput kode bank yang tidak dikenal
 * - Mencegah typo yang menyebabkan transfer ke bank salah
 * - Memastikan format kode bank seragam (uppercase, hanya huruf)
 */
@Composable
private fun BankSelector(selectedCode: String, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            "Bank / E-Wallet Tujuan",
            fontWeight = FontWeight.SemiBold,
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.onSurface
        )
        if (selectedCode.isNotBlank()) {
            Text(
                "Dipilih: $selectedCode",
                color = Primary,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
        }
        // Grid chip — setiap baris berisi 5 bank
        SUPPORTED_BANKS.chunked(5).forEach { rowBanks ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                rowBanks.forEach { bankCode ->
                    val isSelected = selectedCode == bankCode
                    // Setiap chip menggunakan weight(1f) di dalam Row scope
                    Surface(
                        onClick = { onSelect(bankCode) },
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .border(
                                1.dp,
                                if (isSelected) Primary else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
                                RoundedCornerShape(8.dp)
                            ),
                        color = if (isSelected) Primary.copy(alpha = 0.12f)
                                else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
                    ) {
                        Box(
                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 7.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                bankCode,
                                fontSize = 9.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                color = if (isSelected) Primary else MaterialTheme.colorScheme.onSurface,
                                maxLines = 1
                            )
                        }
                    }
                }
                // Isi sisa slot baris terakhir agar layout tidak berantakan
                val remainder = 5 - rowBanks.size
                if (remainder > 0) {
                    repeat(remainder) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}
