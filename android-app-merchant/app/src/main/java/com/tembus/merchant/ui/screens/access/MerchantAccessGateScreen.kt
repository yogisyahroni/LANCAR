package com.tembus.merchant.ui.screens.access

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.PendingActions
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.localization.MerchantText as LocalizedText

private const val STATUS_TITLE = "Cek status pendaftaran"

/**
 * Entry gate for the merchant operational shell.
 *
 * It deliberately has no bottom navigation: a TEMBUS account without an
 * approved merchant context must never see merchant operations as if they
 * were available.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MerchantAccessGateScreen(
    onReady: () -> Unit,
    onOpenRegistration: () -> Unit,
    onOpenStatus: () -> Unit,
    onRetry: () -> Unit,
    onLogout: () -> Unit,
    viewModel: MerchantAccessGateViewModel = appViewModel { MerchantAccessGateViewModel(it.merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(state.phase) {
        if (state.phase == MerchantAccessPhase.READY) onReady()
    }

    Scaffold(
        topBar = {
            TopAppBar(title = { LocalizedText("Portal Merchant") })
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 20.dp, vertical = 24.dp),
            contentAlignment = Alignment.Center
        ) {
            when (state.phase) {
                MerchantAccessPhase.LOADING -> LoadingContent()
                MerchantAccessPhase.REGISTRATION_REQUIRED -> RegistrationRequiredContent(
                    onOpenRegistration = onOpenRegistration,
                    onOpenStatus = onOpenStatus,
                    onLogout = onLogout
                )
                MerchantAccessPhase.PENDING_REVIEW -> PendingContent(
                    onOpenStatus = onOpenStatus,
                    onRetry = onRetry,
                    onLogout = onLogout
                )
                MerchantAccessPhase.REJECTED -> RejectedContent(
                    onOpenRegistration = onOpenRegistration,
                    onOpenStatus = onOpenStatus,
                    onLogout = onLogout
                )
                MerchantAccessPhase.SUSPENDED -> SuspendedContent(
                    onOpenStatus = onOpenStatus,
                    onLogout = onLogout
                )
                MerchantAccessPhase.ERROR -> ErrorContent(
                    onRetry = onRetry,
                    onLogout = onLogout
                )
                MerchantAccessPhase.READY -> LoadingContent()
            }
        }
    }
}

@Composable
private fun LoadingContent() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator()
        Spacer(modifier = Modifier.size(16.dp))
        LocalizedText("Memeriksa akses toko…", style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun RegistrationRequiredContent(
    onOpenRegistration: () -> Unit,
    onOpenStatus: () -> Unit,
    onLogout: () -> Unit
) {
    GateCard(
        icon = Icons.Filled.Storefront,
        title = "Belum terdaftar sebagai merchant",
        message = "Akun TEMBUS kamu sudah berhasil masuk. Lengkapi pendaftaran merchant perorangan terlebih dahulu untuk membuka fitur toko.",
        iconTint = MaterialTheme.colorScheme.primary
    ) {
        Button(onClick = onOpenRegistration, modifier = Modifier.fillMaxWidth()) {
            LocalizedText("Daftar sebagai merchant")
            Spacer(modifier = Modifier.width(8.dp))
            Icon(Icons.Filled.ArrowForward, contentDescription = null)
        }
        Spacer(modifier = Modifier.size(8.dp))
        OutlinedButton(onClick = onOpenStatus, modifier = Modifier.fillMaxWidth()) {
            LocalizedText(STATUS_TITLE)
        }
        LogoutButton(onClick = onLogout)
    }
}

@Composable
private fun PendingContent(
    onOpenStatus: () -> Unit,
    onRetry: () -> Unit,
    onLogout: () -> Unit
) {
    GateCard(
        icon = Icons.Filled.PendingActions,
        title = "Pendaftaran sedang diproses",
        message = "Data toko sudah diterima dan sedang diperiksa oleh tim TEMBUS. Fitur operasional akan terbuka setelah pendaftaran disetujui.",
        iconTint = MaterialTheme.colorScheme.tertiary
    ) {
        Button(onClick = onOpenStatus, modifier = Modifier.fillMaxWidth()) {
            LocalizedText(STATUS_TITLE)
        }
        Spacer(modifier = Modifier.size(8.dp))
        OutlinedButton(onClick = onRetry, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.Refresh, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            LocalizedText("Perbarui status")
        }
        LogoutButton(onClick = onLogout)
    }
}

@Composable
private fun RejectedContent(
    onOpenRegistration: () -> Unit,
    onOpenStatus: () -> Unit,
    onLogout: () -> Unit
) {
    GateCard(
        icon = Icons.Filled.ErrorOutline,
        title = "Pendaftaran perlu diperbaiki",
        message = "Ada data yang perlu diperbaiki sebelum toko dapat diaktifkan. Lihat alasan peninjauan lalu ajukan kembali data yang benar.",
        iconTint = MaterialTheme.colorScheme.error
    ) {
        Button(onClick = onOpenStatus, modifier = Modifier.fillMaxWidth()) {
            LocalizedText(STATUS_TITLE)
        }
        Spacer(modifier = Modifier.size(8.dp))
        OutlinedButton(onClick = onOpenRegistration, modifier = Modifier.fillMaxWidth()) {
            LocalizedText("Perbaiki pendaftaran")
        }
        LogoutButton(onClick = onLogout)
    }
}

@Composable
private fun SuspendedContent(
    onOpenStatus: () -> Unit,
    onLogout: () -> Unit
) {
    GateCard(
        icon = Icons.Filled.ErrorOutline,
        title = "Akses toko ditangguhkan",
        message = "Akses operasional toko sedang ditangguhkan. Periksa status pendaftaran atau hubungi bantuan TEMBUS untuk mengetahui langkah berikutnya.",
        iconTint = MaterialTheme.colorScheme.error
    ) {
        Button(onClick = onOpenStatus, modifier = Modifier.fillMaxWidth()) {
            LocalizedText(STATUS_TITLE)
        }
        LogoutButton(onClick = onLogout)
    }
}

@Composable
private fun ErrorContent(onRetry: () -> Unit, onLogout: () -> Unit) {
    GateCard(
        icon = Icons.Filled.ErrorOutline,
        title = "Akses toko belum dapat diperiksa",
        message = "Kami belum bisa memeriksa status akun toko. Periksa koneksi lalu coba lagi.",
        iconTint = MaterialTheme.colorScheme.error
    ) {
        Button(onClick = onRetry, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.Refresh, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            LocalizedText("Coba lagi")
        }
        LogoutButton(onClick = onLogout)
    }
}

@Composable
private fun GateCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    message: String,
    iconTint: androidx.compose.ui.graphics.Color,
    actions: @Composable () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(56.dp))
            Spacer(modifier = Modifier.size(16.dp))
            LocalizedText(
                title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.size(8.dp))
            LocalizedText(
                message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.size(24.dp))
            actions()
        }
    }
}

@Composable
private fun LogoutButton(onClick: () -> Unit) {
    TextButton(onClick = onClick, contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)) {
        Icon(Icons.Filled.Logout, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(modifier = Modifier.width(8.dp))
        LocalizedText("Keluar / ganti akun")
    }
}
