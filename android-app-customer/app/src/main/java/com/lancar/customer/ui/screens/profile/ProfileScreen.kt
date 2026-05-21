package com.lancar.customer.ui.screens.profile

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Help
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.lancar.customer.data.model.ProfileResponse
import com.lancar.customer.data.security.LocalDeviceSecurityManager
import com.lancar.customer.ui.security.LocalSecuritySettingsPanel
import com.lancar.customer.ui.theme.Primary
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

private val ProfileBackground = Color(0xFFF4F7FB)
private val SuccessGreen = Color(0xFF008C5A)
private val DangerRed = Color(0xFFC62828)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    viewModel: ProfileViewModel = hiltViewModel(),
    onBackClick: () -> Unit,
    onLogout: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val localSecurityManager = remember(context) {
        LocalDeviceSecurityManager(context.applicationContext)
    }
    var activeDialog by remember { mutableStateOf<ProfileDialog?>(null) }

    LaunchedEffect(state) {
        val currentState = state as? ProfileUiState.Success ?: return@LaunchedEffect
        val notice = currentState.message ?: currentState.error
        if (!notice.isNullOrBlank()) {
            snackbarHostState.showSnackbar(notice)
            viewModel.consumeProfileNotice()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Profil", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Kembali")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.White,
                    titleContentColor = Color(0xFF17202A),
                    navigationIconContentColor = Color(0xFF17202A)
                )
            )
        },
        containerColor = ProfileBackground
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when (val currentState = state) {
                is ProfileUiState.Loading, ProfileUiState.Idle -> ProfileLoadingState()
                is ProfileUiState.Error -> ProfileErrorState(
                    message = currentState.message,
                    onRetry = viewModel::fetchProfile
                )
                is ProfileUiState.Success -> ProfileContent(
                    profile = currentState.profile,
                    isUpdating = currentState.isUpdating,
                    onRefresh = viewModel::fetchProfile,
                    onEditClick = { activeDialog = ProfileDialog.Edit },
                    onSettingsClick = { activeDialog = ProfileDialog.Settings },
                    onSecurityClick = { activeDialog = ProfileDialog.Security },
                    onHelpClick = { activeDialog = ProfileDialog.Help },
                    onLogout = { viewModel.logout(onLogout) }
                )
            }
        }
    }

    val currentProfile = (state as? ProfileUiState.Success)?.profile
    when (activeDialog) {
        ProfileDialog.Edit -> if (currentProfile != null) {
            EditProfileDialog(
                profile = currentProfile,
                isUpdating = (state as? ProfileUiState.Success)?.isUpdating == true,
                onDismiss = { activeDialog = null },
                onSubmit = { name, phone ->
                    viewModel.updateProfile(name, phone)
                    activeDialog = null
                }
            )
        }
        ProfileDialog.Settings -> SettingsDialog(
            onDismiss = { activeDialog = null },
            onRefresh = {
                activeDialog = null
                viewModel.fetchProfile()
            }
        )
        ProfileDialog.Security -> SecurityDialog(
            securityManager = localSecurityManager,
            onDismiss = { activeDialog = null },
            onNotice = { message ->
                scope.launch { snackbarHostState.showSnackbar(message) }
            },
            onLogout = {
                activeDialog = null
                viewModel.logout(onLogout)
            }
        )
        ProfileDialog.Help -> HelpDialog(onDismiss = { activeDialog = null })
        null -> Unit
    }
}

@Composable
private fun ProfileContent(
    profile: ProfileResponse,
    isUpdating: Boolean,
    onRefresh: () -> Unit,
    onEditClick: () -> Unit,
    onSettingsClick: () -> Unit,
    onSecurityClick: () -> Unit,
    onHelpClick: () -> Unit,
    onLogout: () -> Unit
) {
    val primaryContact = profile.email.ifBlank {
        profile.phoneNumber.ifBlank { "Kontak belum dilengkapi" }
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        AvatarBadge(name = profile.name)
        Spacer(Modifier.height(14.dp))
        Text(
            text = profile.name.ifBlank { "Customer LANCAR" },
            fontWeight = FontWeight.ExtraBold,
            fontSize = 24.sp,
            color = Color(0xFF17202A),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = primaryContact,
            color = Color(0xFF6B7280),
            fontSize = 14.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        Spacer(Modifier.height(24.dp))
        WalletCard(balance = profile.walletBalance)
        Spacer(Modifier.height(18.dp))
        ProfileStatusCard(profile = profile)
        Spacer(Modifier.height(18.dp))

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(24.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(modifier = Modifier.padding(horizontal = 18.dp, vertical = 10.dp)) {
                MenuRow(icon = Icons.Default.Edit, label = "Ubah Profil", onClick = onEditClick)
                MenuRow(icon = Icons.Default.Settings, label = "Pengaturan Aplikasi", onClick = onSettingsClick)
                MenuRow(icon = Icons.Default.Shield, label = "Keamanan", onClick = onSecurityClick)
                MenuRow(icon = Icons.Default.Help, label = "Pusat Bantuan", onClick = onHelpClick, showDivider = false)
            }
        }

        Spacer(Modifier.height(18.dp))
        OutlinedButton(
            onClick = onRefresh,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = RoundedCornerShape(16.dp),
            enabled = !isUpdating
        ) {
            Icon(Icons.Default.Refresh, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text("Sinkronkan Profil", fontWeight = FontWeight.Bold)
        }

        Spacer(Modifier.height(12.dp))
        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp),
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = DangerRed),
            border = BorderStroke(1.dp, DangerRed.copy(alpha = 0.6f))
        ) {
            Icon(Icons.Default.Logout, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text("Keluar Akun", fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun AvatarBadge(name: String) {
    val initial = name.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "L"
    Box(
        modifier = Modifier
            .size(112.dp)
            .clip(CircleShape)
            .background(Primary.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center
    ) {
        if (initial == "L") {
            Icon(
                Icons.Default.Person,
                contentDescription = null,
                modifier = Modifier.size(52.dp),
                tint = Primary
            )
        } else {
            Text(
                text = initial,
                color = Primary,
                fontSize = 42.sp,
                fontWeight = FontWeight.Black
            )
        }
    }
}

@Composable
private fun WalletCard(balance: Long) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
        shape = RoundedCornerShape(24.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Row(
            modifier = Modifier
                .background(
                    Brush.linearGradient(
                        listOf(Color(0xFF0D6EFD), Color(0xFF008C5A))
                    )
                )
                .padding(22.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text("Saldo Dompet", color = Color.White.copy(alpha = 0.84f), fontSize = 14.sp)
                Spacer(Modifier.height(6.dp))
                Text(
                    text = formatRupiah(balance),
                    color = Color.White,
                    fontWeight = FontWeight.Black,
                    fontSize = 28.sp
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Saldo tersinkron dari rekening dompet customer.",
                    color = Color.White.copy(alpha = 0.78f),
                    fontSize = 12.sp
                )
            }
            Box(
                modifier = Modifier
                    .size(50.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color.White.copy(alpha = 0.18f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = Color.White)
            }
        }
    }
}

@Composable
private fun ProfileStatusCard(profile: ProfileResponse) {
    val verifiedPhoneNumber = profile.phoneNumber.asPhoneDisplay()
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        shape = RoundedCornerShape(24.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(
                text = "Status Akun",
                fontWeight = FontWeight.ExtraBold,
                fontSize = 18.sp,
                color = Color(0xFF17202A)
            )
            StatusRow(Icons.Default.VerifiedUser, "Identitas", if (profile.name.isNotBlank()) "Lengkap" else "Perlu dilengkapi")
            StatusRow(
                Icons.Default.Email,
                "Kontak utama",
                profile.email.ifBlank { profile.phoneNumber.ifBlank { "Belum tersedia" } }
            )
            StatusRow(
                Icons.Default.NotificationsActive,
                "Nomor handphone",
                verifiedPhoneNumber
            )
            StatusRow(Icons.Default.Security, "Proteksi sesi", "Encrypted session aktif")
        }
    }
}

@Composable
private fun StatusRow(icon: ImageVector, label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(SuccessGreen.copy(alpha = 0.1f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = SuccessGreen)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(label, color = Color(0xFF6B7280), fontSize = 12.sp)
            Text(
                value,
                color = Color(0xFF17202A),
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun MenuRow(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    showDivider: Boolean = true
) {
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        color = Color.Transparent
    ) {
        Row(
            modifier = Modifier.padding(vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(icon, contentDescription = null, tint = Color(0xFF4B5563), modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(16.dp))
            Text(label, fontSize = 16.sp, modifier = Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = Color(0xFF9CA3AF))
        }
    }
    if (showDivider) Divider(thickness = 0.5.dp, color = Color(0xFFE5E7EB))
}

@Composable
private fun EditProfileDialog(
    profile: ProfileResponse,
    isUpdating: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (String, String) -> Unit
) {
    var name by remember(profile.id) { mutableStateOf(profile.name) }
    var phone by remember(profile.id) { mutableStateOf(profile.phoneNumber.takeIf { !it.contains("@") }.orEmpty()) }
    val canSubmit = name.trim().length >= 2 && !isUpdating

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Ubah Profil", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Nama lengkap") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("Nomor handphone") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Text(
                    text = "Perubahan disimpan ke database LANCAR dan tersinkron ke sesi aplikasi.",
                    color = Color(0xFF6B7280),
                    fontSize = 12.sp
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSubmit(name, phone) },
                enabled = canSubmit,
                colors = ButtonDefaults.buttonColors(containerColor = Primary)
            ) {
                if (isUpdating) {
                    Box(
                        modifier = Modifier
                            .size(16.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.82f))
                    )
                    Spacer(Modifier.width(8.dp))
                }
                Text("Simpan")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Batal")
            }
        }
    )
}

@Composable
private fun SettingsDialog(onDismiss: () -> Unit, onRefresh: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Pengaturan Aplikasi", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                StatusRow(Icons.Default.NotificationsActive, "Notifikasi", "Mengikuti preferensi sistem perangkat")
                StatusRow(Icons.Default.Refresh, "Konfigurasi peta", "Disinkronkan dari admin tanpa rebuild app")
                Text(
                    text = "Gunakan sinkronisasi untuk mengambil konfigurasi terbaru dari server.",
                    color = Color(0xFF6B7280),
                    fontSize = 12.sp
                )
            }
        },
        confirmButton = {
            Button(onClick = onRefresh, colors = ButtonDefaults.buttonColors(containerColor = Primary)) {
                Text("Sinkronkan")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Tutup")
            }
        }
    )
}

@Composable
private fun SecurityDialog(
    securityManager: LocalDeviceSecurityManager,
    onDismiss: () -> Unit,
    onNotice: (String) -> Unit,
    onLogout: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Keamanan Akun", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                StatusRow(Icons.Default.Lock, "Penyimpanan token", "EncryptedSharedPreferences aktif")
                StatusRow(Icons.Default.Shield, "Verifikasi sesi", "OTP hanya untuk registrasi dan perangkat baru")
                LocalSecuritySettingsPanel(
                    securityManager = securityManager,
                    onNotice = onNotice
                )
                Text(
                    text = "Saat proteksi aktif, pembayaran dan aksi sensitif perlu PIN atau biometrik lokal. Keluar akun tetap menghapus token terenkripsi dari perangkat ini.",
                    color = Color(0xFF6B7280),
                    fontSize = 12.sp
                )
            }
        },
        confirmButton = {
            OutlinedButton(
                onClick = onLogout,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = DangerRed),
                border = BorderStroke(1.dp, DangerRed.copy(alpha = 0.6f))
            ) {
                Text("Keluar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Tutup")
            }
        }
    )
}

@Composable
private fun HelpDialog(onDismiss: () -> Unit) {
    val context = LocalContext.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Pusat Bantuan", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Tim operasional LANCAR siap membantu kendala akun, pembayaran, dan pengiriman.")
                Text("Email: support@lancar.id", color = Color(0xFF6B7280))
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val intent = Intent(Intent.ACTION_SENDTO).apply {
                        data = Uri.parse("mailto:support@lancar.id")
                        putExtra(Intent.EXTRA_SUBJECT, "Bantuan aplikasi customer LANCAR")
                    }
                    try {
                        context.startActivity(intent)
                    } catch (_: ActivityNotFoundException) {
                        onDismiss()
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = Primary)
            ) {
                Text("Hubungi Support")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Tutup")
            }
        }
    )
}

@Composable
private fun ProfileLoadingState() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(96.dp)
                .clip(CircleShape)
                .background(Primary.copy(alpha = 0.12f))
        )
        Spacer(Modifier.height(18.dp))
        Box(
            modifier = Modifier
                .width(180.dp)
                .height(22.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Color(0xFFE3EAF4))
        )
        Spacer(Modifier.height(8.dp))
        Box(
            modifier = Modifier
                .width(132.dp)
                .height(14.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(Color(0xFFE3EAF4))
        )
        Spacer(Modifier.height(28.dp))
        repeat(3) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(86.dp)
                    .clip(RoundedCornerShape(22.dp))
                    .background(Color.White)
            )
            Spacer(Modifier.height(12.dp))
        }
        Text("Memuat profil...", color = Color(0xFF4B5563), fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ProfileErrorState(message: String, onRetry: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(Icons.Default.Security, contentDescription = null, tint = DangerRed, modifier = Modifier.size(48.dp))
            Spacer(Modifier.height(12.dp))
            Text("Profil belum tersinkron", fontWeight = FontWeight.Bold, fontSize = 20.sp)
            Spacer(Modifier.height(6.dp))
            Text(message, color = Color(0xFF6B7280))
            Spacer(Modifier.height(16.dp))
            Button(onClick = onRetry, colors = ButtonDefaults.buttonColors(containerColor = Primary)) {
                Text("Coba Lagi")
            }
        }
    }
}

private fun formatRupiah(value: Long): String {
    val formatter = NumberFormat.getCurrencyInstance(Locale("id", "ID"))
    formatter.maximumFractionDigits = 0
    return formatter.format(value).replace("Rp", "Rp ").replace(",00", "")
}

private fun String.asPhoneDisplay(): String {
    val normalized = trim()
    return if (normalized.isBlank() || normalized.contains("@")) "Belum tersedia" else normalized
}

private enum class ProfileDialog {
    Edit,
    Settings,
    Security,
    Help
}
