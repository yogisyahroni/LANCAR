package com.tembus.merchant.ui.screens.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryLight

/**
 * ProfileScreen — tab Profil: info merchant, status verifikasi,
 * dan logout. (FOOD-BIKE-049: status "menunggu verifikasi" ditampilkan di sini.)
 */
@Composable
fun ProfileScreen(
    onGoToRegistration: () -> Unit,
    onLoggedOut: () -> Unit,
    viewModel: ProfileViewModel = appViewModel {
        ProfileViewModel(it.merchantRepository, it.authRepository, it.sessionManager)
    }
) {
    val state by viewModel.uiState.collectAsState()

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
            return@Column
        }

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
                    m.jamBuka?.let { b ->
                        m.jamTutup?.let { t ->
                            ProfileInfoRow("Jam Operasional", "$b - $t")
                        }
                    }
                    ProfileInfoRow("Status Toko", if (m.isOpen) "Buka" else "Tutup")
                    ProfileInfoRow("Completion Rate", "${m.completionRatePct}%")
                    m.createdAt?.let { ProfileInfoRow("Terdaftar", it.substring(0, 10)) }
                }
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
