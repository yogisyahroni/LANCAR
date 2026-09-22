package com.tembus.customer.ui.screens.profile

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Refresh
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
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.theme.Primary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WalletTopUpScreen(
    onBack: () -> Unit,
    viewModel: WalletTopUpViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val session = state.session
    val amount = state.amountText.toLongOrNull()
    val isAmountValid = amount != null && amount >= WalletTopUpViewModel.MIN_TOP_UP_IDR
    val orange = Color(0xFFFF7800)
    val ink = Color(0xFF10231C)
    // Figma `TEMBUS - Top Up Saldo TEMBUS-Pay` uses the neutral wallet canvas.
    val softBackground = Color(0xFFF7F8F6)

    fun openInvoice() {
        val invoiceUrl = session?.invoiceUrl ?: return
        val uri = Uri.parse(invoiceUrl)
        if (uri.scheme != "https") return
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
            viewModel.clearSession()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Top up TEMBUS-Pay", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = softBackground,
                    titleContentColor = ink,
                    navigationIconContentColor = ink
                )
            )
        },
        bottomBar = {
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 10.dp,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = if (session != null) "Total pembayaran" else "Nominal top up",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 12.sp
                        )
                        Text(
                            text = when {
                                session != null -> WalletTopUpViewModel.formatRupiah(session.total.takeIf { it > 0 } ?: session.amount)
                                amount != null -> WalletTopUpViewModel.formatRupiah(amount)
                                else -> "Masukkan nominal"
                            },
                            color = ink,
                            fontWeight = FontWeight.Black
                        )
                    }
                    Button(
                        onClick = { if (session != null) openInvoice() else viewModel.submit() },
                        enabled = if (session != null) session.invoiceUrl?.startsWith("https://") == true else isAmountValid && !state.isSubmitting && !state.isLoading,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = orange,
                            contentColor = Color.White,
                            disabledContainerColor = orange.copy(alpha = 0.35f)
                        )
                    ) {
                        if (state.isSubmitting) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                            Spacer(Modifier.width(8.dp))
                        }
                        Text(
                            text = if (session != null) "Buka halaman pembayaran" else "Lanjutkan Pembayaran",
                            fontWeight = FontWeight.Black
                        )
                        if (session == null) {
                            Spacer(Modifier.width(8.dp))
                            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null)
                        }
                    }
                }
            }
        },
        containerColor = softBackground
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF005B3E))
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 18.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        BoxIcon(Icons.Default.AccountBalanceWallet, Color(0xFFDDF5E8))
                        Spacer(Modifier.width(10.dp))
                        Text("SALDO AKTIF TEMBUS-PAY", color = Color(0xFFDDF5E8), fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp)
                        Spacer(Modifier.weight(1f))
                        Text("IDR", color = Color(0xFFDDF5E8), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                    Text(
                        text = state.balance?.let { WalletTopUpViewModel.formatRupiah(it.balance) } ?: "Belum tersedia",
                        color = Color.White,
                        fontWeight = FontWeight.Black,
                        style = MaterialTheme.typography.headlineSmall
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Perbarui otomatis setelah pembayaran terkonfirmasi", color = Color(0xFFB8D9C8), fontSize = 10.sp, modifier = Modifier.weight(1f))
                        if (state.isLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                        } else {
                            IconButton(onClick = viewModel::refreshBalance, modifier = Modifier.size(28.dp)) {
                                Icon(Icons.Default.Refresh, contentDescription = "Perbarui saldo", tint = Color.White, modifier = Modifier.size(17.dp))
                            }
                        }
                    }
                    state.balance?.holdBalance?.takeIf { it > 0 }?.let { hold ->
                        Text("Saldo ditahan: ${WalletTopUpViewModel.formatRupiah(hold)}", color = Color(0xFFFFD7B2), fontSize = 10.sp)
                    }
                }
            }

            Text("Pilih Nominal Top Up", color = ink, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = state.amountText,
                onValueChange = viewModel::setAmount,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Nominal dalam rupiah") },
                placeholder = { Text("Min. Rp 10.000") },
                leadingIcon = { Text("Rp", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                enabled = !state.isSubmitting,
                shape = RoundedCornerShape(14.dp),
                colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                    focusedContainerColor = Color.White,
                    unfocusedContainerColor = Color.White
                )
            )

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(20_000L, 50_000L, 100_000L, 200_000L, 500_000L, 1_000_000L)
                    .chunked(3)
                    .forEach { rowAmounts ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            rowAmounts.forEach { quickAmount ->
                                OutlinedButton(
                                    onClick = { viewModel.setAmount(quickAmount.toString()) },
                                    enabled = !state.isSubmitting,
                                    modifier = Modifier.weight(1f).height(44.dp),
                                    shape = RoundedCornerShape(12.dp),
                                    contentPadding = PaddingValues(horizontal = 2.dp),
                                    border = BorderStroke(1.dp, if (amount == quickAmount) orange else MaterialTheme.colorScheme.outlineVariant),
                                    colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(
                                        containerColor = if (amount == quickAmount) orange.copy(alpha = 0.08f) else Color.White,
                                        contentColor = if (amount == quickAmount) orange else ink
                                    )
                                ) {
                                    Text(WalletTopUpViewModel.formatRupiah(quickAmount).replace("Rp ", "Rp"), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
            }

            Text("Metode Pembayaran", color = ink, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleMedium)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    PaymentProviderRow(
                        icon = Icons.Default.QrCode2,
                        title = "Payment gateway TEMBUS",
                        subtitle = "QRIS dan Virtual Account tersedia di halaman provider",
                        accent = orange,
                        selected = true
                    )
                    androidx.compose.material3.HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f))
                    Row(verticalAlignment = Alignment.Top) {
                        Icon(Icons.Default.Info, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "Metode final dan biaya mengikuti sesi pembayaran yang dibuat server. Saldo tidak berubah sebelum callback provider diterima.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 11.sp,
                            lineHeight = 15.sp
                        )
                    }
                }
            }

            state.error?.let { message ->
                Text(message, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
            }
            state.notice?.let { message ->
                Text(message, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
            }

            session?.let { currentSession ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFEAF7F0)),
                    border = BorderStroke(1.dp, Color(0xFFB9DEC9)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Primary, modifier = Modifier.size(19.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Sesi pembayaran siap", color = ink, fontWeight = FontWeight.Bold)
                        }
                        Text(
                            "Saldo akan berubah setelah callback pembayaran diterima server.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 12.sp
                        )
                        SessionDetailRow("Nominal", WalletTopUpViewModel.formatRupiah(currentSession.amount))
                        if (currentSession.fee > 0) SessionDetailRow("Biaya provider", WalletTopUpViewModel.formatRupiah(currentSession.fee))
                        SessionDetailRow("Referensi", currentSession.referenceId.ifBlank { "Dibuat oleh server" })
                        if (currentSession.invoiceUrl.isNullOrBlank()) {
                            Text("Link pembayaran belum tersedia dari server. Coba cek saldo lagi setelah provider memproses sesi.", color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
                        }
                    }
                }
            }

            if (state.isLoading) {
                Text("Memuat saldo…", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun BoxIcon(icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color) {
    Surface(shape = CircleShape, color = Color.White.copy(alpha = 0.15f), modifier = Modifier.size(30.dp)) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(17.dp))
        }
    }
}

@Composable
private fun PaymentProviderRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    accent: Color,
    selected: Boolean
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Surface(shape = RoundedCornerShape(12.dp), color = accent.copy(alpha = 0.12f), modifier = Modifier.size(42.dp)) {
            Box(contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(22.dp))
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, color = Color(0xFF10231C), fontWeight = FontWeight.Bold, fontSize = 13.sp)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (selected) Icon(Icons.Default.CheckCircle, contentDescription = "Metode dipilih", tint = Primary, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun SessionDetailRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
        Text(value, color = Color(0xFF10231C), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
